"""
网络搜索工具
使用 DuckDuckGo 进行搜索
"""
from typing import Dict, Any, Optional
import httpx
import logging

logger = logging.getLogger(__name__)


class WebSearchTool:
    """网络搜索工具"""
    
    name = "web_search"
    description = "搜索互联网获取实时信息。当用户询问最新事件、新闻或需要实时数据时使用。"
    
    def __init__(self):
        self.search_url = "https://api.duckduckgo.com/"
    
    async def execute(self, query: str, max_results: int = 5) -> Dict[str, Any]:
        """
        执行网络搜索
        
        Args:
            query: 搜索查询
            max_results: 最大结果数
            
        Returns:
            搜索结果
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    self.search_url,
                    params={"q": query, "format": "json", "no_html": 1}
                )
                response.raise_for_status()
                data = response.json()
            
            results = []
            
            # 提取摘要
            if data.get("Abstract"):
                results.append({
                    "title": data.get("Heading", "摘要"),
                    "snippet": data["Abstract"],
                    "url": data.get("AbstractURL", "")
                })
            
            # 提取相关主题
            for topic in data.get("RelatedTopics", [])[:max_results]:
                if isinstance(topic, dict) and "Text" in topic:
                    results.append({
                        "title": topic.get("Text", "")[:80],
                        "snippet": topic.get("Text", ""),
                        "url": topic.get("FirstURL", "")
                    })
            
            return {
                "query": query,
                "results": results,
                "count": len(results)
            }
        except Exception as e:
            logger.error(f"网络搜索失败: {str(e)}")
            return {"query": query, "results": [], "count": 0, "error": str(e)}
    
    def get_tool_schema(self) -> Dict[str, Any]:
        """获取工具的 OpenAI function calling schema"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "搜索查询关键词"
                        }
                    },
                    "required": ["query"]
                }
            }
        }
