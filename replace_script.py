import os

def replace_in_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content.replace('$', '$')
        new_content = new_content.replace('USD ($)', 'USD ($)')
        
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Replaced in {filepath}")
    except Exception as e:
        pass

for root, dirs, files in os.walk(r'c:\Users\wembo\Desktop\ANDY 1 - Copie'):
    for d in ['.git', '__pycache__', 'env', 'venv']:
        if d in dirs:
            dirs.remove(d)
    for file in files:
        if file.endswith(('.html', '.js', '.py', '.css', '.md', '.txt')):
            replace_in_file(os.path.join(root, file))
