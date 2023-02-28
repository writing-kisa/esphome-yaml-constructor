import asyncio
import os
import shutil
import subprocess
import uuid

import yaml
from fastapi import FastAPI, BackgroundTasks, status, File, UploadFile, Depends, Request
from sqlalchemy.orm import Session
from starlette.responses import FileResponse
import uvicorn

from pydantic import BaseModel
from yaml import SafeLoader

from db import models
from db.connect import SessionLocal, engine
from lib.logs import execute, get_hash_from_db_logs
from lib.methods import save_file_to_uploads, get_hash_md5, command_compil, compile_yaml_file
from db.queries import add_file_to_db, get_file_from_db, get_hash_from_db, update_compile_test_in_db, \
    delete_file_from_db
from settings import UPLOADED_FILES_PATH, COMPILE_DIR

models.Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app = FastAPI()


@app.post("/upload", tags=["Upload"], status_code=status.HTTP_200_OK)
async def upload_file(request: Request, background_tasks: BackgroundTasks = BackgroundTasks(), db: Session = Depends(get_db)):
    # переименовую и сохраняю в папку
    # file_name = str(uuid.uuid4())
    # format_filename(file, file_name)
    file_name = await save_file_to_uploads(request)


    # читаю файл и достаю esphome name
    read_yaml = yaml.safe_load(open(f"{UPLOADED_FILES_PATH}{file_name}.yaml"))
    name_esphome = read_yaml['esphome']['name']

    # генерирую хеш и все добавляю в базу данных
    hash_yaml = get_hash_md5(file_name)
    file_info_from_db = add_file_to_db(db, file_name=file_name, name_esphome=name_esphome, hash_yaml=hash_yaml, compile_test=False)
    background_tasks.add_task(compile_yaml_file, db, hash_yaml, name_esphome, file_name)
    # await compile_yaml_file(db, hash_yaml, name_esphome, file_name)
    print(file_info_from_db.hash_yaml)
    return file_info_from_db.hash_yaml


@app.post("/compile", tags=["Compile"], status_code=status.HTTP_200_OK)
async def compile_file(
        hash_yaml: str,
        db: Session = Depends(get_db)
):
    # получаю информацию из бд по id ищу скомпилированных хэш если был, компилирую или вывожу файл

    file_info_from_db = get_hash_from_db(db, hash_yaml)
    file_name = file_info_from_db.name_yaml
    return FileResponse(f"compile_files/{file_name}.bin",
                        filename=f"{file_name}.bin",
                        media_type="application/octet-stream")


@app.post("/logs", tags=["Logs"], status_code=status.HTTP_200_OK)
async def logs_compile_file(
        hash_yaml: str,
        db: Session = Depends(get_db)
):
    file_info_from_db = get_hash_from_db_logs(db, hash_yaml)
    file_name = file_info_from_db.name_yaml
    cmd = command_compil(file_name)

    # logs = subprocess.Popen(cmd,
    #                         stdout=subprocess.PIPE,
    #                         stderr=subprocess.STDOUT)
    # stdout, stderr = logs.communicate()
    #
    # result = stderr.decode().strip()
    print(execute(cmd))

    return file_name


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
