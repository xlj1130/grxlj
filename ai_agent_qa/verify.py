import ast
files = [
    'C:/Users/86188/PyCharmMiscProject/ai_agent_qa/backend/agents/agent.py',
    'C:/Users/86188/PyCharmMiscProject/ai_agent_qa/backend/services/openai_service.py',
]
for f in files:
    with open(f, encoding='utf-8') as fp:
        ast.parse(fp.read())
    print(f'OK: {f}')
print('ALL SYNTAX OK')
