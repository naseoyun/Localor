# 1. 깃허브 레포지토리 다운로드 
git clone https://github.com/naseoyun/Localor.git
# 2. 프로젝트 폴더로 이동 
cd Localor
# 3. Git LFS로 올렸던 대용량 CSV/JSON 파일 원본 다운로드 
git lfs pull 

"OPENAI_API_KEY= api 키 입력" | Out-File -Encoding utf8 .env

# 4. 서버 실행 
python server.py 

주소창에 
http://localhost:8000 
