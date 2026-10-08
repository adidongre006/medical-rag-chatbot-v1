import os
from dotenv import load_dotenv

load_dotenv()

token = os.getenv("HF_TOKEN")

print("Token exists:", bool(token))
print("Token prefix:", token[:7] if token else None)