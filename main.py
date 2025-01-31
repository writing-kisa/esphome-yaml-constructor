import asyncio
import json
import os
import subprocess
import uuid

import uvicorn
import yaml
from fastapi import FastAPI, status, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import FileResponse, JSONResponse

from db import models
from db.connect import SessionLocal, engine
from db.queries import add_file_to_db, get_hash_from_db, add_yaml_to_db, get_yaml_from_db, get_json_from_db, \
    get_file_from_db
from lib.methods import save_file_to_uploads, get_hash_md5, read_stream, post_compile_process, read_bin_file
from settings import UPLOADED_FILES_PATH, COMPILE_CMD, SHARE_URL

models.Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app = FastAPI()

origins = [os.environ.get('REACT_APP_APP_URL')]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.post("/share", tags=["Share"], status_code=status.HTTP_201_CREATED)
async def create_share_file(request: Request, db: Session = Depends(get_db)):
    # save json and file name to database, create url and return it
    json_text = await request.json()
    info_json = get_json_from_db(db, json_text)
    if info_json is not None:
        file_name = info_json.uuid
    else:
        file_name = str(uuid.uuid4())
        add_yaml_to_db(db, file_name, json_text)
    url = f"{SHARE_URL}{file_name}"
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            'uuid': file_name,
            'url': url
        }
    )


@app.get("/share", tags=["Share"], status_code=status.HTTP_200_OK)
async def get_share_file(file_name=str, db: Session = Depends(get_db)):
    # fetches json from database and returns it
    info_file = get_yaml_from_db(db, file_name)
    json_info_file = jsonable_encoder(info_file)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={'json_text': json_info_file['json_text']}
    )


@app.post("/validate", tags=["Validate"], status_code=status.HTTP_200_OK)
async def validate(
        request: Request,
        background_tasks: BackgroundTasks = BackgroundTasks()
):
    file_name = await save_file_to_uploads(request)
    cmd = ['esphome', 'config', f'{UPLOADED_FILES_PATH}{file_name}.yaml']
    # compilation process
    process = await asyncio.to_thread(subprocess.Popen, cmd,
                                      stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    # line-by-line output of logs (generator)
    otv = read_stream(process.stdout)
    # deleting the created yaml file
    background_tasks.add_task(os.remove, f'{UPLOADED_FILES_PATH}{file_name}.yaml')
    return StreamingResponse(otv, media_type="text/plain")


@app.post("/save_config", tags=["Save Config"], status_code=status.HTTP_200_OK)
async def save_config(request: Request, db: Session = Depends(get_db)):
    file_name = await save_file_to_uploads(request)

    # read file and get esphome name
    read_yaml = yaml.safe_load(open(f"{UPLOADED_FILES_PATH}{file_name}.yaml"))
    name_esphome = read_yaml['esphome']['name']
    if 'esp32' in read_yaml or read_yaml['esphome'].get('platform') == "ESP32":
        platform = "ESP32"
    else:
        platform = "ESP8266"

    # generate a hash and add everything to the database
    hash_yaml = get_hash_md5(file_name)
    old_file_info_from_db = get_hash_from_db(db, hash_yaml)
    if old_file_info_from_db is None:
        add_file_to_db(db, name_yaml=file_name, name_esphome=name_esphome, hash_yaml=hash_yaml,
                       compile_test=False, platform=platform)
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={'file_name': file_name}
        )
    else:
        if not os.path.isfile(f"{UPLOADED_FILES_PATH}{old_file_info_from_db.name_yaml}.yaml"):
            os.rename(f"{UPLOADED_FILES_PATH}{file_name}.yaml",
                      f"{UPLOADED_FILES_PATH}{old_file_info_from_db.name_yaml}.yaml")
        else:
            os.remove(f'{UPLOADED_FILES_PATH}{file_name}.yaml')
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={'file_name': old_file_info_from_db.name_yaml}
        )


@app.post("/compile", tags=["Compile"], status_code=status.HTTP_200_OK)
async def compile_file(request: Request, db: Session = Depends(get_db),
                       background_tasks: BackgroundTasks = BackgroundTasks()):
    file_name = (await request.body()).decode('utf-8')

    cmd = f"{COMPILE_CMD} {UPLOADED_FILES_PATH}{file_name}.yaml"
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=True)

    background_tasks.add_task(post_compile_process, file_name, db)
    return StreamingResponse(read_stream(process.stdout), media_type='text/event-stream')


@app.post("/download", tags=["Download"], status_code=status.HTTP_200_OK)
async def download_bin(
        request: Request,
):
    # get information about the file, delete the yaml file, return the binary to the user
    file_name = (await request.body()).decode('utf-8')
    if not file_name:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                'message': 'The configuration was not compiled'
            }
        )
    else:
        return FileResponse(f"compile_files/{file_name}.bin",
                            filename=f"{file_name}.bin",
                            media_type="application/octet-stream")


@app.get("/manifest/{file_name}")
async def get_manifest(file_name: str, db: Session = Depends(get_db)):
    info_file = get_file_from_db(db, file_name)

    platform = info_file.platform
    bin_path = f"/bin/{file_name}.bin"

    with open("manifest.json", 'r') as file:
        data = json.load(file)
    data['builds'][0]['chipFamily'] = platform
    data['builds'][0]['parts'][0]['path'] = bin_path
    return JSONResponse(content=data, media_type="application/json")


@app.get("/bin/{file_name}.bin")
async def get_manifest(file_name: str):
    bin_path = f"./compile_files/{file_name}.bin"
    return FileResponse(bin_path)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
