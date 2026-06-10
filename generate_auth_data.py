import hashlib
import json
import csv
import random
import string

def sha256_hash(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def generate_random_password(length=8):
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

def main():
    # 1. Generate keys from ERS Tech-0000 to ERS Tech-0500
    keys_cleartext = [f"ERS Tech-{str(i).zfill(4)}" for i in range(501)]
    keys_hashed = [sha256_hash(k) for k in keys_cleartext]

    # 2. Generate 100 accounts and passwords
    accounts = {}
    accounts_hashed = {}
    
    for i in range(1, 101):
        username = f"user{str(i).zfill(3)}"
        password = generate_random_password(6)
        accounts[username] = password
        accounts_hashed[username] = sha256_hash(password)

    # Output auth.json (for GitHub)
    auth_data = {
        "keys": keys_hashed,
        "users": accounts_hashed
    }
    with open("auth.json", "w", encoding="utf-8") as f:
        json.dump(auth_data, f, indent=2)

    # Output CSV for user's private records
    with open("授权码与账号明文对照表.csv", "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        
        writer.writerow(["=== 卡密列表 (共501个) ==="])
        writer.writerow(["卡密明文", "哈希值 (已存入auth.json)"])
        for clear, hashed in zip(keys_cleartext, keys_hashed):
            writer.writerow([clear, hashed])
            
        writer.writerow([])
        writer.writerow(["=== 账号列表 (共100个) ==="])
        writer.writerow(["登录账号", "登录密码", "密码哈希值 (已存入auth.json)"])
        for username, password in accounts.items():
            writer.writerow([username, password, accounts_hashed[username]])

if __name__ == "__main__":
    main()
