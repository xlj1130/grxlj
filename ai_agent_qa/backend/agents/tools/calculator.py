"""
计算器工具
支持数学表达式计算
"""
from typing import Dict, Any
import ast
import operator
import logging

logger = logging.getLogger(__name__)

# 安全的运算符映射
OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


class CalculatorTool:
    """计算器工具 - 安全计算数学表达式"""
    
    name = "calculator"
    description = "计算数学表达式。支持加减乘除、幂运算、取模等运算。"
    
    async def execute(self, expression: str) -> Dict[str, Any]:
        """
        计算数学表达式
        
        Args:
            expression: 数学表达式字符串
            
        Returns:
            计算结果
        """
        try:
            result = self._safe_eval(expression)
            return {
                "expression": expression,
                "result": result,
                "success": True
            }
        except Exception as e:
            logger.error(f"计算失败: {str(e)}")
            return {
                "expression": expression,
                "result": None,
                "success": False,
                "error": str(e)
            }
    
    def _safe_eval(self, expr: str) -> float:
        """安全计算数学表达式（不使用 eval）"""
        tree = ast.parse(expr, mode='eval')
        return self._eval_node(tree.body)
    
    def _eval_node(self, node) -> float:
        """递归计算 AST 节点"""
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        elif isinstance(node, ast.BinOp):
            left = self._eval_node(node.left)
            right = self._eval_node(node.right)
            op_type = type(node.op)
            if op_type in OPERATORS:
                return OPERATORS[op_type](left, right)
            raise ValueError(f"不支持的运算符: {op_type}")
        elif isinstance(node, ast.UnaryOp):
            operand = self._eval_node(node.operand)
            op_type = type(node.op)
            if op_type in OPERATORS:
                return OPERATORS[op_type](operand)
            raise ValueError(f"不支持的一元运算符: {op_type}")
        else:
            raise ValueError(f"不支持的表达式类型: {type(node)}")
    
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
                        "expression": {
                            "type": "string",
                            "description": "要计算的数学表达式，如 '2 + 3 * 4'"
                        }
                    },
                    "required": ["expression"]
                }
            }
        }
