import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, parse, request
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent

# ⭕ .env 파일에서 API 키를 안전하게 로드하는 함수
def load_env():
    env_path = ROOT / '.env'
    if env_path.exists():
        with open(env_path, 'r', encoding='utf-8-sig') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    os.environ[key.strip()] = val.strip()

load_env()



class DashboardHandler(BaseHTTPRequestHandler):
    def _resolve_file_path(self, request_path):
        parsed = parse.urlparse(request_path)
        decoded = unquote(parsed.path)
        if decoded in ('', '/'):
            return ROOT / 'index.html'

        rel_path = decoded.lstrip('/')
        if not rel_path:
            return ROOT / 'index.html'

        candidate = (ROOT / rel_path).resolve()
        try:
            candidate.relative_to(ROOT.resolve())
        except ValueError:
            return None
        return candidate

    def do_GET(self):
        if self.path.startswith('/api/health'):
            self._send_json({'ok': True})
            return

        file_path = self._resolve_file_path(self.path)
        if file_path is None:
            self._send_json({'error': 'Not found'}, status=404)
            return

        if file_path.is_file():
            self._serve_file(file_path)
            return

        self._send_json({'error': 'Not found'}, status=404)

    def do_POST(self):
        path = parse.urlparse(self.path).path
        if path == '/api/generate-plan':
            self._handle_generate_plan()
            return
        if path == '/api/modify-plan':
            self._handle_modify_plan()
            return
        self._send_json({'error': 'Not found'}, status=404)

    def log_message(self, format, *args):
        return

    def _read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length <= 0:
            return {}
        body = self.rfile.read(length).decode('utf-8')
        return json.loads(body or '{}')

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self, file_path):
        content = file_path.read_bytes()
        suffix = file_path.suffix.lower()
        content_type_map = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.csv': 'text/csv; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
        }
        content_type = content_type_map.get(suffix, 'application/octet-stream')
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _get_api_key(self, payload):
        return payload.get('apiKey') or os.getenv('OPENAI_API_KEY')

    def _handle_generate_plan(self):
        payload = self._read_json()
        api_key = self._get_api_key(payload)
        if not api_key:
            self._send_json({'error': 'OpenAI API 키가 필요합니다. 입력창에 키를 넣어 주세요.'}, status=400)
            return

        prompt = payload.get('prompt', '')
        
        system_content = (
            "당신은 15년 차 베테랑 공공도서관 문화프로그램 전문 기획자입니다.\n"
            "당신의 목표는 주어진 파편화된 데이터를 논리적으로 분석하여, 기괴하지 않고 매우 현실적인 기획안을 도출하는 것입니다.\n"
            "반드시 마크다운 코드블록(```json) 없이 순수한 JSON 형식으로만 출력하세요. "
            "(사용할 키: title, summary, target, concept, flow)"
        )

        user_content = f"""
아래 입력 정보를 바탕으로 도서관 문화프로그램 기획안을 작성해 주세요.

[입력 정보]
{prompt}

[전문 기획자로서의 3단계 분석 및 기획 지침 - 엄수할 것!]

1. 강점 주제 (도서관 정체성 확립)
   - 제시된 '주제/특색'을 전체 프로그램의 '핵심 뼈대'로 삼으세요.

2. 트렌드 키워드 (물리적 결합 절대 금지 / 이면 분석 반영)
   - 제시된 트렌드 단어들(예: 귀신나방, 파친코, 호랑이 등)을 프로그램 기획안에 **문자 그대로 절대 등장시키지 마세요!** (예: 남미 호랑이 그리기, 귀신나방 생태학습 -> 최악의 기획)
   - 대신, 이 단어들이 왜 유행했는지 그 '배경적 관심사'를 추론하세요. (예: 파친코 -> 가족의 역사나 디아스포라, 귀신나방/호랑이 -> 자연 생태나 전통 설화)
   - 분석한 배경적 관심사 중 '강점 주제'와 가장 잘 어울리는 **단 1개의 흐름**만 선택하여 기획의 '컨셉(concept)'으로 자연스럽게 녹여내세요.

3. 유사지역 사례 (현실성 확보)
   - 제시된 '참고 사례'의 운영 방식(예: 드로잉, 글쓰기 등 형식)과 대상 연령을 벤치마킹하여, 당장 내일 도서관에서 실행 가능한 '현실적인 수업 흐름(flow)'을 도출하세요.

[JSON 출력 항목]
- title: 강점 주제가 돋보이는 현실적이고 매력적인 제목
- summary: 프로그램의 전반적인 내용 요약 (2~3문장)
- target: 참고 사례를 바탕으로 설정한 구체적인 참여 대상
- concept: 기획 의도 (트렌드 단어 이면의 '관심사'를 어떻게 반영했는지 서술)
- flow: 1. 도입(...) 2. 전개(...) 형태의 현실적인 진행 흐름
"""

        request_body = {
            'model': 'gpt-4o',  # 모델 성능 극대화 (gpt-4o-mini -> gpt-4o 변경)
            'messages': [
                {
                    'role': 'system',
                    'content': system_content
                },
                {'role': 'user', 'content': user_content}
            ],
            'temperature': 0.7
        }

        try:
            req = request.Request(
                'https://api.openai.com/v1/chat/completions',
                data=json.dumps(request_body).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {api_key}'
                },
                method='POST'
            )
            with request.urlopen(req, timeout=60) as resp:
                result = json.load(resp)
        except error.HTTPError as exc:
            try:
                detail = json.load(exc)
            except Exception:
                detail = {'error': {'message': str(exc)}}
            self._send_json({'error': detail.get('error', {}).get('message', 'OpenAI 요청에 실패했습니다.')}, status=500)
            return
        except Exception as exc:
            self._send_json({'error': str(exc)}, status=500)
            return

        text = result['choices'][0]['message']['content'].strip()
        
        # [강력한 JSON 파싱 로직] 정규식을 이용해 텍스트 내부에서 { 부터 } 까지 완벽하게 추출
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            text = json_match.group(0)

        try:
            parsed = json.loads(text)
        except Exception as e:
            # 터미널 창에 왜 실패했는지 원본 텍스트를 띄워줍니다 (디버깅 용도)
            print(f"\n--- JSON 파싱 실패 ---\n오류: {e}\n원본 텍스트:\n{text}\n----------------------\n")
            parsed = {
                'title': '맞춤형 기획안 생성 오류',
                'summary': '응답을 분석하는 중 오류가 발생했습니다. 터미널 창의 로그를 확인해주세요.',
                'target': '전체 이용자',
                'concept': '시스템 오류',
                'flow': '다시 시도해주세요.'
            }

        self._send_json(parsed)

    def _handle_modify_plan(self):
        payload = self._read_json()
        api_key = self._get_api_key(payload)
        if not api_key:
            self._send_json({'error': 'OpenAI API 키가 필요합니다. 입력창에 키를 넣어 주세요.'}, status=400)
            return

        plan = payload.get('plan', {})
        message = payload.get('message', '')
        prompt = f"다음 기획안에 대한 사용자의 요청을 반영해서 한국어로 수정된 제안문을 1개 문단으로 작성해줘.\n기획안: {json.dumps(plan, ensure_ascii=False)}\n사용자 요청: {message}"

        request_body = {
            'model': 'gpt-4o',  # 여기도 플래그십 모델로 변경
            'messages': [
                {'role': 'system', 'content': '당신은 도서관 프로그램 기획 보조자입니다. 짧고 실용적인 한국어 답변을 제공하세요.'},
                {'role': 'user', 'content': prompt}
            ],
            'temperature': 0.7
        }

        try:
            req = request.Request(
                'https://api.openai.com/v1/chat/completions',
                data=json.dumps(request_body).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {api_key}'
                },
                method='POST'
            )
            with request.urlopen(req, timeout=60) as resp:
                result = json.load(resp)
        except error.HTTPError as exc:
            try:
                detail = json.load(exc)
            except Exception:
                detail = {'error': {'message': str(exc)}}
            self._send_json({'error': detail.get('error', {}).get('message', 'OpenAI 요청에 실패했습니다.')}, status=500)
            return
        except Exception as exc:
            self._send_json({'error': str(exc)}, status=500)
            return

        text = result['choices'][0]['message']['content']
        self._send_json({'reply': text.strip()})


if __name__ == '__main__':
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', '8000'))
    server = ThreadingHTTPServer((host, port), DashboardHandler)
    print(f'Serving on http://{host}:{port}')
    server.serve_forever()