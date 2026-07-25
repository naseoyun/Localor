const SIDO_SHORT_MAP = {
    '서울특별시': '서울',
    '부산광역시': '부산',
    '대구광역시': '대구',
    '인천광역시': '인천',
    '광주광역시': '광주',
    '대전광역시': '대전',
    '울산광역시': '울산',
    '세종특별자치시': '세종',
    '경기도': '경기',
    '강원특별자치도': '강원',
    '충청북도': '충북',
    '충청남도': '충남',
    '전라북도': '전북',
    '전라남도': '전남',
    '경상북도': '경북',
    '경상남도': '경남',
    '제주특별자치도': '제주'
};

const state = {
    rawData: { libs: {}, regionScores: [], libScores: [], similar: [], courses: [], keywords: [] },
    selection: { sido: '', sigungu: '', library: '' },
    choices: { topics: [], case: null, keywords: [] },
    plan: { title: '', summary: '', target: '', concept: '', flow: '' },
    planGenerated: false,
    step: 1
};

function normalizeSido(sido) {
    return SIDO_SHORT_MAP[sido] || sido;
}

function parseNumber(value) {
    const num = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(num) ? num : 0;
}

function normalizeText(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/[^\w가-힣]/g, '');
}

function findLibraryTopicRows(libraryName) {
    const target = normalizeText(libraryName);
    return state.rawData.libScores.filter((row) => {
        const names = [row['도서관명'], row['표준도서관명'], row['도서관']];
        return names.some((name) => normalizeText(name) === target);
    });
}

function loadCsv(url) {
    return fetch(url)
        .then((response) => {
            if (!response.ok) return '';
            return response.text();
        })
        .then((text) => {
            if (!text) return [];
            const result = Papa.parse(text, { header: true, skipEmptyLines: true });
            return result.data || [];
        });
}

async function init() {
    try {
        const libRes = await fetch('./data/지역별_도서관_목록.json');
        state.rawData.libs = await libRes.json();

        state.rawData.regionScores = await loadCsv('./data/시군구별_지역특색_추출결과.csv');
        state.rawData.libScores = await loadCsv('./data/도서관별_강점주제_추출결과.csv');
        state.rawData.similar = await loadCsv('./data/top5_similar_최종_상세근거포함.csv');
        state.rawData.courses = await loadCsv('./data/03_통합_분석용_official만.csv');
        state.rawData.keywords = await loadCsv('./data/전국_이달의키워드.csv');

        initSelectors();
        renderKeywords();
        refreshButtons();
        updateSelectionSummary();
    } catch (error) {
        console.error(error);
        document.querySelector('#similar-cases').innerHTML = '<div class="empty-state">데이터를 불러오지 못했습니다. Live Server로 다시 열어 주세요.</div>';
    }
}

function initSelectors() {
    const sidoSelect = document.getElementById('sido-select');
    const sigunguSelect = document.getElementById('sigungu-select');
    const libSelect = document.getElementById('library-select');

    Object.keys(state.rawData.libs).forEach((sido) => {
        sidoSelect.add(new Option(sido, sido));
    });

    sidoSelect.addEventListener('change', (event) => {
        state.selection.sido = event.target.value;
        state.selection.sigungu = '';
        state.selection.library = '';
        state.choices = { topics: [], case: null, keywords: [] };
        clearSelectionUI();
        sigunguSelect.innerHTML = '<option value="">시/군/구 선택</option>';
        libSelect.innerHTML = '<option value="">도서관 선택</option>';
        libSelect.disabled = true;
        if (state.selection.sido) {
            Object.keys(state.rawData.libs[state.selection.sido]).forEach((sigungu) => {
                sigunguSelect.add(new Option(sigungu, sigungu));
            });
            sigunguSelect.disabled = false;
        } else {
            sigunguSelect.disabled = true;
        }
        updateSelectionSummary();
        refreshButtons();
    });

    sigunguSelect.addEventListener('change', (event) => {
        state.selection.sigungu = event.target.value;
        state.selection.library = '';
        state.choices = { topics: [], case: null, keywords: [] };
        clearSelectionUI();
        libSelect.innerHTML = '<option value="">도서관 선택</option>';
        if (state.selection.sigungu) {
            (state.rawData.libs[state.selection.sido][state.selection.sigungu] || []).forEach((lib) => {
                libSelect.add(new Option(lib, lib));
            });
            libSelect.disabled = false;
        } else {
            libSelect.disabled = true;
        }
        updateSelectionSummary();
        refreshButtons();
    });

    libSelect.addEventListener('change', (event) => {
        state.selection.library = event.target.value;
        if (state.selection.library) {
            processDataForSelectedRegion();
            showStep(2);
        }
        updateSelectionSummary();
        refreshButtons();
    });
}

function clearSelectionUI() {
    document.getElementById('region-topics').innerHTML = '<div class="empty-state">선택된 지역의 주제 데이터가 표시됩니다.</div>';
    document.getElementById('library-topics').innerHTML = '<div class="empty-state">선택된 도서관의 주제 데이터가 표시됩니다.</div>';
    document.getElementById('similar-cases').innerHTML = '<div class="empty-state">유사 사례가 여기에 표시됩니다.</div>';
    document.getElementById('trending-keywords').innerHTML = '<div class="empty-state">키워드를 선택해 주세요.</div>';
    document.getElementById('plan-preview').innerHTML = '<div class="empty-state">기획안 생성 버튼을 누르면 제안이 여기에 표시됩니다.</div>';
    document.getElementById('start-planning-btn').disabled = true;
    state.planGenerated = false;
    state.plan = { title: '', summary: '', target: '', concept: '', flow: '' };
}

function processDataForSelectedRegion() {
    const { sido, sigungu, library } = state.selection;
    state.choices = { topics: [], case: null, keywords: [] };
    document.getElementById('go-step3-btn').disabled = true;
    document.getElementById('start-planning-btn').disabled = true;

    const regionData = state.rawData.regionScores.filter((row) => row['시도'] === sido && row['시군구'] === sigungu);
    const libraryData = findLibraryTopicRows(library);

    renderTopics(regionData, 'region-topics');
    if (libraryData.length > 0) {
        renderTopics(libraryData, 'library-topics');
    } else {
        renderTopics(regionData, 'library-topics');
        document.getElementById('library-topics').insertAdjacentHTML('beforeend', '<div class="empty-state">도서관별 데이터가 없어 지역 강점으로 대체해 안내합니다.</div>');
    }

    renderSimilarCases(sido, sigungu);
    renderKeywords();
    updateSelectionSummary();
}

function renderTopics(data, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state">표시할 주제가 없습니다.</div>';
        return;
    }

    const sorted = [...data].sort((a, b) => parseNumber(b.Specialty_Score || b['Specialty_Score'] || b['LQ']) - parseNumber(a.Specialty_Score || a['Specialty_Score'] || a['LQ']));
    const maxScore = sorted.length > 0 ? parseNumber(sorted[0].Specialty_Score || sorted[0]['Specialty_Score'] || sorted[0]['LQ']) : 1;

    sorted.slice(0, 8).forEach((item) => {
        const name = item['세부주제'] || item['주제'] || item['topic'];
        const score = parseNumber(item.Specialty_Score || item['Specialty_Score'] || item['LQ']);
        const percent = maxScore > 0 ? (score / maxScore) * 100 : 0;

        const row = document.createElement('div');
        row.className = 'topic-bar';
        if (state.choices.topics.includes(name)) row.classList.add('selected');
        row.innerHTML = `
            <div class="fill" style="width:${Math.max(percent, 8)}%"></div>
            <span class="label">${name}</span>
            <span class="score">${score.toFixed(1)}</span>
        `;
        row.addEventListener('click', () => toggleTopic(name));
        container.appendChild(row);
    });
}

function toggleTopic(name) {
    if (state.choices.topics.includes(name)) {
        state.choices.topics = state.choices.topics.filter((item) => item !== name);
    } else if (state.choices.topics.length >= 3) {
        alert('주제는 최대 3개까지 선택할 수 있습니다.');
        return;
    } else {
        state.choices.topics.push(name);
    }
    refreshTopicSelectionUI();
    refreshButtons();
}

function refreshTopicSelectionUI() {
    document.querySelectorAll('.topic-bar').forEach((bar) => {
        const name = bar.querySelector('.label')?.textContent;
        bar.classList.toggle('selected', state.choices.topics.includes(name));
    });
}

function renderSimilarCases(sido, sigungu) {
    const container = document.getElementById('similar-cases');
    container.innerHTML = '';

    const shortSido = normalizeSido(sido);
    const match = state.rawData.similar.find((row) => normalizeSido(row['지역']) === shortSido && row['시군구'] === sigungu);
    const cases = [];

    if (match) {
        for (let i = 1; i <= 5; i += 1) {
            const simSigungu = match[`similar_${i}_시군구`];
            if (!simSigungu) continue;
            const courses = state.rawData.courses.filter((course) => course['지역명'] === simSigungu);
            if (courses.length > 0) {
                courses.sort((a, b) => parseNumber(b['경쟁률']) - parseNumber(a['경쟁률']));
                const best = courses[0];
                cases.push({
                    region: simSigungu,
                    course: best['강좌명'] || '추천 강좌',
                    target: best['대상'] || '전체',
                    competition: best['경쟁률'] || '0',
                    library: best['표준도서관명'] || best['도서관명'] || ''
                });
            }
        }
    }

    if (cases.length === 0) {
        container.innerHTML = '<div class="empty-state">해당 지역의 유사 사례를 찾지 못했습니다. 지역명을 다시 확인해 주세요.</div>';
        return;
    }

    cases.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'case-card';
        if (state.choices.case && state.choices.case.course === item.course) card.classList.add('selected');
        card.innerHTML = `
            <strong>${item.course}</strong>
            <div class="meta">${item.region} · 대상 ${item.target}<br>경쟁률 ${item.competition}${item.library ? ` · ${item.library}` : ''}</div>
        `;
        card.addEventListener('click', () => {
            state.choices.case = item;
            document.querySelectorAll('.case-card').forEach((el) => el.classList.remove('selected'));
            card.classList.add('selected');
            refreshButtons();
        });
        container.appendChild(card);
    });
}

function renderKeywords() {
    const container = document.getElementById('trending-keywords');
    container.innerHTML = '';
    const keywords = (state.rawData.keywords || []).slice(0, 10).map((item) => item['word'] || item[Object.keys(item)[0]]);
    if (keywords.length === 0) {
        container.innerHTML = '<div class="empty-state">키워드 데이터가 없습니다.</div>';
        return;
    }
    keywords.forEach((word) => {
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'keyword-tag';
        if (state.choices.keywords.includes(word)) tag.classList.add('selected');
        tag.textContent = word;
        tag.addEventListener('click', () => toggleKeyword(word));
        container.appendChild(tag);
    });
}

function toggleKeyword(word) {
    if (state.choices.keywords.includes(word)) {
        state.choices.keywords = state.choices.keywords.filter((item) => item !== word);
    } else if (state.choices.keywords.length >= 3) {
        alert('키워드는 최대 3개까지 선택할 수 있습니다.');
        return;
    } else {
        state.choices.keywords.push(word);
    }
    document.querySelectorAll('.keyword-tag').forEach((tag) => {
        tag.classList.toggle('selected', state.choices.keywords.includes(tag.textContent));
    });
    refreshButtons();
}

function refreshButtons() {
    document.getElementById('go-step2-btn').disabled = !state.selection.library;
    document.getElementById('go-step3-btn').disabled = !(state.choices.topics.length > 0 && state.choices.case && state.choices.keywords.length > 0);
    document.getElementById('start-planning-btn').disabled = !(state.choices.topics.length > 0 && state.choices.case && state.choices.keywords.length > 0);
}

function updateSelectionSummary() {
    const summary = document.getElementById('selection-summary');
    if (!state.selection.sido && !state.selection.sigungu && !state.selection.library) {
        summary.textContent = '선택된 지역 정보가 여기에 표시됩니다.';
        return;
    }
    const label = [state.selection.sido, state.selection.sigungu, state.selection.library].filter(Boolean).join(' · ');
    summary.textContent = `현재 선택: ${label}`;
}

function showStep(step) {
    state.step = step;
    document.querySelectorAll('.step-item').forEach((item) => {
        item.classList.toggle('active', Number(item.dataset.step) === step);
    });
    document.querySelectorAll('.panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `step-${step}`);
    });
}

function appendMessage(role, text) {
    const body = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${role}-msg`;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}

async function callOpenAI(path, payload) {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || '요청에 실패했습니다.');
    }
    return data;
}

function buildPlanText() {
    const topicText = state.choices.topics.join(', ');
    const keywordText = state.choices.keywords.join(', ');
    const caseText = state.choices.case?.course || '유사 사례';
    const title = `${state.selection.library} 맞춤형 ${state.choices.topics[0] || '문화프로그램'}`;

    return `${state.selection.library}를 기준으로 ${topicText} 주제를 중심에 두고, ${keywordText} 키워드를 결합해 ${title}을 제안합니다. ${caseText}를 참고해 60분 체험형 + 30분 토론형 흐름으로 구성하면 참여율이 높습니다.`;
}

async function renderPlanProposal() {
    const preview = document.getElementById('plan-preview');
    preview.innerHTML = '<div class="empty-state">GPT가 기획안을 생성하고 있습니다...</div>';

    const topicText = state.choices.topics.join(', ');
    const keywordText = state.choices.keywords.join(', ');
    const caseText = state.choices.case?.course || '유사 사례';
    const apiKey = document.getElementById('api-key-input')?.value.trim() || '';

    const prompt = `${state.selection.library} 도서관에서 ${topicText} 주제와 ${keywordText} 키워드를 반영한 문화프로그램 기획안 1개를 작성해줘. ${caseText}를 참고하되, 도서관 프로그램으로 적합하게 구성해줘. 결과는 JSON 형식으로 title, summary, target, concept, flow만 포함해줘.`;

    try {
        const data = await callOpenAI('/api/generate-plan', { apiKey, prompt });
        state.plan = {
            title: data.title || `${state.selection.library} 맞춤형 프로그램`,
            summary: data.summary || '',
            target: data.target || '전체 이용자',
            concept: data.concept || '',
            flow: data.flow || '도입 / 체험 / 토론 / 마무리'
        };

        preview.innerHTML = `
            <div class="plan-card">
                <span class="plan-chip">맞춤 기획안</span>
                <h3>${state.plan.title}</h3>
                <p>${state.plan.summary}</p>
            </div>
            <div class="plan-card">
                <h3>기획 포인트</h3>
                <ul>
                    <li>대상: ${state.plan.target}</li>
                    <li>핵심 주제: ${topicText}</li>
                    <li>참고 사례: ${caseText}</li>
                    <li>키워드: ${keywordText || '선택된 키워드 없음'}</li>
                </ul>
            </div>
            <div class="plan-card">
                <h3>운영안</h3>
                <p>${state.plan.concept}</p>
                <p><strong>진행 흐름</strong>: ${state.plan.flow}</p>
            </div>
        `;
    } catch (error) {
        preview.innerHTML = `<div class="empty-state">${error.message}</div>`;
    }
}

function openChat() {
    if (!state.planGenerated) {
        return;
    }
    const widget = document.getElementById('chat-widget');
    widget.classList.add('open');
    document.getElementById('chat-input').disabled = false;
    document.getElementById('chat-send-btn').disabled = false;
}

function closeChat() {
    document.getElementById('chat-widget').classList.remove('open');
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    appendMessage('user', text);
    input.value = '';
    const apiKey = document.getElementById('api-key-input')?.value.trim() || '';
    appendMessage('ai', '수정 요청을 반영해 GPT가 다시 정리하고 있습니다...');
    try {
        const data = await callOpenAI('/api/modify-plan', { apiKey, plan: state.plan, message: text });
        appendMessage('ai', data.reply || '요청을 반영했습니다.');
    } catch (error) {
        appendMessage('ai', error.message);
    }
}

function buildReply(text) {
    const lowered = text.toLowerCase();
    if (lowered.includes('기획안') || lowered.includes('프로그램')) {
        return `${state.selection.library} 기준으로는 ${state.choices.topics.join(', ')}를 중심에 두고, ${state.choices.keywords[0] || '키워드'}를 반영해 더 매력적인 운영안으로 다듬을 수 있습니다.`;
    }
    if (lowered.includes('대상') || lowered.includes('청소년')) {
        return '대상별로는 청소년층이면 활동성과 참여도를 높이는 체험형 구성이, 성인층이면 깊이 있는 토론형 구성이 잘 맞습니다.';
    }
    return `${state.selection.library} 기준으로는 ${state.choices.topics[0] || '주제'}를 중심에 두고, 유사 사례와 키워드를 연결해 제목과 운영 흐름을 더 정교하게 다듬을 수 있습니다.`;
}

function attachEvents() {
    document.getElementById('go-step2-btn').addEventListener('click', () => showStep(2));
    document.getElementById('go-step3-btn').addEventListener('click', () => {
        showStep(3);
        state.planGenerated = true;
        renderPlanProposal();
    });
    document.getElementById('back-step1-btn').addEventListener('click', () => showStep(1));
    document.getElementById('back-step2-btn').addEventListener('click', () => showStep(2));
    document.getElementById('start-planning-btn').addEventListener('click', async () => {
        showStep(3);
        state.planGenerated = true;
        document.getElementById('chat-input').value = '';
        document.getElementById('chat-messages').innerHTML = '<div class="msg ai-msg">맞춤 기획안 생성 중입니다. 잠시만 기다려 주세요.</div>';
        await renderPlanProposal();
        if (state.plan.title) {
            appendMessage('ai', '기획안이 생성됐습니다. 원하는 방향으로 수정 요청을 보내 주세요.');
        }
    });
    document.getElementById('chat-toggle').addEventListener('click', () => {
        const widget = document.getElementById('chat-widget');
        if (widget.classList.contains('open')) {
            closeChat();
        } else {
            openChat();
        }
    });
    document.getElementById('chat-close-btn').addEventListener('click', closeChat);
    document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') sendChatMessage();
    });
}

attachEvents();
init();
