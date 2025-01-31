from sqlalchemy import Column, Integer, String, Boolean, JSON
from db.connect import Base


class Filename(Base):
    __tablename__ = 'filename'

    id = Column(Integer, primary_key=True, index=True)
    name_yaml = Column(String)
    name_esphome = Column(String)
    hash_yaml = Column(String)
    compile_test = Column(Boolean, default=False)
    platform = Column(String)


class Yamlfile(Base):
    __tablename__ = 'yamlfile'

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String)
    json_text = Column(JSON)
