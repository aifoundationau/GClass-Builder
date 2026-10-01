import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace inline color: '#fff' with color: 'var(--text-main)'
content = re.sub(r"color:\s*'(?:#fff|#ffffff|white)'", "color: 'var(--text-main)'", content)

# Replace inline color: '#94a3b8' with color: 'var(--text-muted)'
content = re.sub(r"color:\s*'#94a3b8'", "color: 'var(--text-muted)'", content)

# Replace inline color: '#8ab4f8' (light blue) with color: '#1e40af' (dark blue)
content = re.sub(r"color:\s*'#8ab4f8'", "color: '#1e40af'", content)

# Replace inline background: 'rgba(255, 255, 255, 0.08)' with var(--border-color)
content = re.sub(r"rgba\(255, \s*255, \s*255, \s*0\.08\)", "var(--border-color)", content)
content = re.sub(r"rgba\(255, \s*255, \s*255, \s*0\.05\)", "var(--border-color)", content)

# Also check for other light pastels
content = re.sub(r"color:\s*'#6ee7b7'", "color: '#166534'", content)
content = re.sub(r"color:\s*'#f87171'", "color: '#991b1b'", content)
content = re.sub(r"color:\s*'#e2e8f0'", "color: 'var(--text-main)'", content)

# Let's also check for style={{ color: "#fff" }} (double quotes)
content = re.sub(r'color:\s*"(?:#fff|#ffffff|white)"', 'color: "var(--text-main)"', content)
content = re.sub(r'color:\s*"#94a3b8"', 'color: "var(--text-muted)"', content)
content = re.sub(r'color:\s*"#8ab4f8"', 'color: "#1e40af"', content)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
