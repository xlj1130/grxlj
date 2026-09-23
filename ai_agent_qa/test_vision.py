"""测试 OpenAI Vision API 连通性"""
import os
import sys
import base64

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from config.settings import settings

print("=" * 60)
print("配置检查")
print("=" * 60)
print(f"OPENAI_VISION_BASE_URL: {settings.OPENAI_VISION_BASE_URL or '(空，使用默认)'}")
print(f"OPENAI_VISION_API_KEY:  ...{settings.OPENAI_VISION_API_KEY[-6:] if settings.OPENAI_VISION_API_KEY else '(空)'}")
print(f"OPENAI_VISION_MODEL:    {settings.OPENAI_VISION_MODEL}")
print()

# 检查 uploads 目录中是否有图片
upload_dir = os.path.join(os.path.dirname(__file__), 'uploads', 'images')
images = []
if os.path.isdir(upload_dir):
    images = [f for f in os.listdir(upload_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif'))]

if not images:
    print("错误: uploads/images 目录中没有图片文件")
    sys.exit(1)

test_image = os.path.join(upload_dir, images[0])
print(f"测试图片: {test_image}")
print(f"图片大小: {os.path.getsize(test_image)} bytes")
print()

# 读取图片并转 base64
with open(test_image, 'rb') as f:
    img_data = base64.b64encode(f.read()).decode('utf-8')

ext = os.path.splitext(test_image)[1].lower()
mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'}
mime_type = mime_map.get(ext, 'image/jpeg')
image_content = f"data:{mime_type};base64,{img_data}"

print(f"Base64 长度: {len(image_content)} 字符")
print()

# 测试 API 调用
import asyncio
import openai

async def test_vision():
    vision_api_key = settings.OPENAI_VISION_API_KEY or settings.OPENAI_API_KEY
    vision_base_url = settings.OPENAI_VISION_BASE_URL or settings.OPENAI_BASE_URL
    
    client_kwargs = {"api_key": vision_api_key, "timeout": 120.0}
    if vision_base_url:
        client_kwargs["base_url"] = vision_base_url
    
    client = openai.AsyncOpenAI(**client_kwargs)
    
    print(f"正在调用 {vision_base_url or 'OpenAI 默认'} 的 {settings.OPENAI_VISION_MODEL} ...")
    print()
    
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "这张照片里的人是男的还是女的？大概多大年纪？"},
                        {"type": "image_url", "image_url": {"url": image_content}}
                    ]
                }
            ],
            max_tokens=500
        )
        
        print("=" * 60)
        print("API 调用成功！")
        print("=" * 60)
        print(f"回复: {response.choices[0].message.content}")
        print(f"Token 使用: {response.usage.total_tokens}")
        
    except Exception as e:
        print("=" * 60)
        print(f"API 调用失败: {type(e).__name__}")
        print("=" * 60)
        print(f"错误信息: {str(e)}")

asyncio.run(test_vision())
