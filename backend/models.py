from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="client") # "admin" or "client"

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(String, unique=True, index=True)
    filename = Column(String)
    uploader_id = Column(Integer, ForeignKey("users.id"))
    size_bytes = Column(Integer)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, default="New Chat")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    messages = relationship("Message", back_populates="conversation")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"))
    role = Column(String) # "user" or "bot"
    content = Column(String)
    sources = Column(String, nullable=True) # JSON string of sources
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")
