"""测试视频分析工具导入"""
import sys
sys.path.insert(0, 'backend')

from backend.agents.tools.video_analyzer import VideoAnalyzerTool

print("✓ VideoAnalyzerTool 导入成功")
print(f"  - 工具名称: {VideoAnalyzerTool.name}")
print(f"  - 工具描述: {VideoAnalyzerTool.description[:50]}...")

# 检查 OpenCV 是否可用
try:
    import cv2
    print(f"✓ OpenCV 版本: {cv2.__version__}")
except ImportError as e:
    print(f" OpenCV 导入失败: {e}")
    sys.exit(1)

print("\n所有依赖检查通过!")
