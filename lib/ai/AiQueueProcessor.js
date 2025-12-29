/**
 * AiQueueProcessor - AI 학습 큐 처리기
 *
 * 페르소나 관심사/검색어 자동 생성
 * 클릭 시나리오 생성
 * 실패 분석 및 패턴 최적화
 */

import personaDB from '../db/PersonaDB.js';

// AI 작업 유형별 프롬프트 템플릿
const PROMPTS = {
  generate_interests: `당신은 한국 네이버 쇼핑 사용자 행동 전문가입니다.

다음 페르소나에 맞는 자연스러운 관심사를 생성해주세요:

페르소나 정보:
- 코드: {persona_code}
- 연령대: {age_group}대
- 성별: {gender}
- 직업/유형: {user_type}
- 타겟 카테고리: {target_category}

요구사항:
1. 타겟 카테고리와 자연스럽게 연결되는 관심사 3-5개
2. 각 관심사의 관심도 (0.0~1.0)
3. 이 관심사를 선택한 이유
4. 관련 검색어 5-10개

JSON 형식으로 응답해주세요:
{
  "interests": [
    { "category": "IT기기", "subcategory": "마우스", "level": 0.9, "reason": "직장인 남성의 주요 관심사" }
  ],
  "keywords": [
    { "keyword": "무선 마우스 추천", "type": "info" },
    { "keyword": "손목 통증 마우스", "type": "problem" }
  ]
}`,

  expand_keywords: `다음 페르소나가 "{target_product}"를 구매하기 전에
자연스럽게 검색할 만한 키워드를 생성해주세요.

페르소나: {persona_code} ({age_group}대 {gender} {user_type})
현재 단계: {phase}
- problem: 문제 인식 ("마우스 손목 통증", "기존 마우스 불편")
- info: 정보 탐색 ("무선 마우스 추천", "인체공학 마우스")
- comparison: 비교 검토 ("로지텍 vs 레이저", "MX Master 후기")
- purchase: 구매 결정 ("MX Master 3 최저가")

기존 키워드: {current_keywords}

5-10개의 새 키워드를 JSON으로 응답해주세요:
{
  "keywords": [
    { "keyword": "키워드", "type": "problem|info|comparison|purchase" }
  ]
}`,

  generate_scenario: `다음 페르소나가 "{target_product}"를 클릭하기까지의
자연스러운 시나리오를 생성해주세요.

페르소나: {persona_code}
- 연령대: {age_group}대
- 성별: {gender}
- 직업: {user_type}
- 행동 스타일: {behavior_style}

타겟 상품: {target_product}
카테고리: {product_category}

체류 시간 규칙:
- 타겟 상품: 2~5분 (긴 체류)
- 비교 상품: 10~30초 (짧은 체류)
- 검색 결과: 30~60초

JSON 형식으로 시나리오를 생성해주세요:
{
  "scenario_name": "시나리오 이름",
  "scenario_type": "direct|compare|blog|revisit",
  "pre_click_actions": [
    { "type": "search", "keyword": "검색어", "dwell": [30, 60] },
    { "type": "view_product", "position": "top5", "dwell": [15, 30] },
    { "type": "back" },
    { "type": "scroll", "amount": "50%" }
  ],
  "target_click_action": {
    "dwell": [120, 300],
    "scroll": "full",
    "view_reviews": true,
    "view_details": true
  },
  "post_click_actions": [
    { "type": "back_to_list", "dwell": [5, 10] },
    { "type": "exit", "prob": 0.6 }
  ]
}`,

  analyze_failure: `세션 실패를 분석하고 개선점을 제안해주세요.

세션 정보:
- 페르소나: {persona_code}
- 에러 유형: {error_type}
- 실패 전 행동: {actions_before_failure}

분석 요청:
1. 실패 원인 추정
2. 개선 권장사항

JSON 형식으로 응답:
{
  "cause": "실패 원인",
  "recommendations": ["권장사항1", "권장사항2"],
  "pattern_adjustments": {
    "scroll_speed": "-20%",
    "dwell_time": "+30%"
  }
}`
};

// 유형 설명 맵
const USER_TYPE_NAMES = {
  W: '직장인',
  S: '학생',
  H: '주부',
  F: '프리랜서',
  R: '은퇴자'
};

const GENDER_NAMES = {
  M: '남성',
  F: '여성'
};

class AiQueueProcessor {
  constructor(options = {}) {
    this.aiClient = options.aiClient; // Anthropic Claude 클라이언트
    this.modelId = options.modelId || 'claude-sonnet-4-20250514';
    this.running = false;
    this.processInterval = options.processInterval || 5000; // 5초
  }

  /**
   * AI 클라이언트 설정
   */
  setAiClient(client) {
    this.aiClient = client;
  }

  /**
   * 큐 처리 시작
   */
  async start() {
    if (this.running) return;
    this.running = true;

    console.log('[AiQueueProcessor] 큐 처리 시작');

    while (this.running) {
      try {
        await this.processNextTask();
      } catch (error) {
        console.error('[AiQueueProcessor] 처리 오류:', error.message);
      }

      await this._sleep(this.processInterval);
    }
  }

  /**
   * 큐 처리 중지
   */
  stop() {
    this.running = false;
    console.log('[AiQueueProcessor] 큐 처리 중지');
  }

  /**
   * 다음 작업 처리
   */
  async processNextTask() {
    const task = await personaDB.getNextAiTask();
    if (!task) return;

    console.log(`[AiQueueProcessor] 작업 처리: ${task.taskType} (ID: ${task.id})`);

    try {
      let result;

      switch (task.taskType) {
        case 'generate_interests':
          result = await this.generateInterests(task);
          break;
        case 'expand_keywords':
          result = await this.expandKeywords(task);
          break;
        case 'generate_scenario':
          result = await this.generateScenario(task);
          break;
        case 'analyze_failure':
          result = await this.analyzeFailure(task);
          break;
        case 'optimize_pattern':
          result = await this.optimizePattern(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.taskType}`);
      }

      // 작업 완료
      await personaDB.completeAiTask(task.id, result);
      console.log(`[AiQueueProcessor] 작업 완료: ${task.id}`);

      // 결과 적용
      await this.applyResult(task, result);

    } catch (error) {
      console.error(`[AiQueueProcessor] 작업 실패: ${task.id}`, error.message);
      await personaDB.failAiTask(task.id, error.message);
    }
  }

  /**
   * 관심사 생성
   */
  async generateInterests(task) {
    const { personaId, inputData } = task;
    const persona = await personaDB.getPersonaById(personaId);

    const prompt = this._fillPrompt(PROMPTS.generate_interests, {
      persona_code: persona.code,
      age_group: persona.ageGroup + '0',
      gender: GENDER_NAMES[persona.gender],
      user_type: USER_TYPE_NAMES[persona.userType],
      target_category: inputData.targetCategory || '일반'
    });

    const response = await this._callAi(prompt);
    return JSON.parse(response);
  }

  /**
   * 검색어 확장
   */
  async expandKeywords(task) {
    const { personaId, inputData } = task;
    const persona = await personaDB.getPersonaById(personaId);
    const currentKeywords = await personaDB.getKeywords(personaId);

    const prompt = this._fillPrompt(PROMPTS.expand_keywords, {
      persona_code: persona.code,
      age_group: persona.ageGroup + '0',
      gender: GENDER_NAMES[persona.gender],
      user_type: USER_TYPE_NAMES[persona.userType],
      target_product: inputData.targetProduct,
      phase: inputData.phase || 'info',
      current_keywords: currentKeywords.map(k => k.keyword).join(', ')
    });

    const response = await this._callAi(prompt);
    return JSON.parse(response);
  }

  /**
   * 시나리오 생성
   */
  async generateScenario(task) {
    const { personaId, targetProductId, inputData } = task;
    const persona = await personaDB.getPersonaById(personaId);

    const prompt = this._fillPrompt(PROMPTS.generate_scenario, {
      persona_code: persona.code,
      age_group: persona.ageGroup + '0',
      gender: GENDER_NAMES[persona.gender],
      user_type: USER_TYPE_NAMES[persona.userType],
      behavior_style: inputData.behaviorStyle || '일반',
      target_product: inputData.targetProduct,
      product_category: inputData.productCategory
    });

    const response = await this._callAi(prompt);
    return JSON.parse(response);
  }

  /**
   * 실패 분석
   */
  async analyzeFailure(task) {
    const { personaId, inputData } = task;
    const persona = personaId ? await personaDB.getPersonaById(personaId) : null;

    const prompt = this._fillPrompt(PROMPTS.analyze_failure, {
      persona_code: persona?.code || 'Unknown',
      error_type: inputData.errorType,
      actions_before_failure: JSON.stringify(inputData.actionsBefore || [])
    });

    const response = await this._callAi(prompt);
    return JSON.parse(response);
  }

  /**
   * 패턴 최적화
   */
  async optimizePattern(task) {
    // 여러 세션의 통계를 기반으로 패턴 최적화
    // 추후 구현
    return { optimized: false, reason: 'Not implemented yet' };
  }

  /**
   * 결과 적용
   */
  async applyResult(task, result) {
    const { taskType, personaId, targetProductId } = task;

    switch (taskType) {
      case 'generate_interests':
        // 관심사 저장
        if (result.interests) {
          for (const interest of result.interests) {
            await personaDB.addInterest(personaId, {
              category: interest.category,
              subcategory: interest.subcategory,
              interestLevel: interest.level,
              source: 'ai_generated',
              aiReason: interest.reason
            });
          }
        }
        // 검색어 저장
        if (result.keywords) {
          for (const kw of result.keywords) {
            await personaDB.addKeyword(personaId, {
              keyword: kw.keyword,
              keywordType: kw.type,
              source: 'ai_generated'
            });
          }
        }
        // 페르소나 상태 업데이트
        await personaDB.updatePersonaStatus(personaId, 'learning', 20);
        break;

      case 'expand_keywords':
        // 새 검색어 저장
        if (result.keywords) {
          for (const kw of result.keywords) {
            await personaDB.addKeyword(personaId, {
              keyword: kw.keyword,
              keywordType: kw.type,
              source: 'ai_generated'
            });
          }
        }
        break;

      case 'generate_scenario':
        // 시나리오 저장
        if (result.scenario_name) {
          await personaDB.createClickScenario({
            targetProductId,
            scenarioName: result.scenario_name,
            scenarioType: result.scenario_type,
            preClickActions: result.pre_click_actions,
            targetClickAction: result.target_click_action,
            postClickActions: result.post_click_actions,
            weight: 10
          });
        }
        break;

      case 'analyze_failure':
        // 분석 결과 로깅 (별도 처리 필요 시 구현)
        console.log(`[AiQueueProcessor] 실패 분석 완료:`, result.cause);
        break;
    }
  }

  /**
   * AI 호출
   */
  async _callAi(prompt) {
    if (!this.aiClient) {
      // AI 클라이언트가 없으면 목업 응답 반환
      console.warn('[AiQueueProcessor] AI 클라이언트 없음 - 목업 응답 사용');
      return this._getMockResponse(prompt);
    }

    const response = await this.aiClient.messages.create({
      model: this.modelId,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // JSON 부분만 추출
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    return jsonMatch[0];
  }

  /**
   * 목업 응답 (AI 클라이언트 없을 때)
   */
  _getMockResponse(prompt) {
    // 프롬프트에서 작업 유형 추정
    if (prompt.includes('관심사를 생성')) {
      return JSON.stringify({
        interests: [
          { category: 'IT기기', subcategory: '마우스', level: 0.85, reason: '업무용 기기 관심' },
          { category: '생활용품', subcategory: '사무용품', level: 0.6, reason: '직장인 필수품' }
        ],
        keywords: [
          { keyword: '무선 마우스 추천', type: 'info' },
          { keyword: '손목 편한 마우스', type: 'problem' },
          { keyword: '로지텍 마우스', type: 'comparison' }
        ]
      });
    }

    if (prompt.includes('키워드를 생성')) {
      return JSON.stringify({
        keywords: [
          { keyword: '마우스 추천 2024', type: 'info' },
          { keyword: '인체공학 마우스 순위', type: 'comparison' }
        ]
      });
    }

    if (prompt.includes('시나리오를 생성')) {
      return JSON.stringify({
        scenario_name: '비교 쇼핑 후 구매',
        scenario_type: 'compare',
        pre_click_actions: [
          { type: 'search', keyword: '무선 마우스 추천', dwell: [30, 60] },
          { type: 'view_product', position: 'top3', dwell: [15, 25] },
          { type: 'back' }
        ],
        target_click_action: {
          dwell: [150, 240],
          scroll: 'full',
          view_reviews: true,
          view_details: true
        },
        post_click_actions: [
          { type: 'back_to_list', dwell: [5, 10] },
          { type: 'exit', prob: 0.7 }
        ]
      });
    }

    if (prompt.includes('실패를 분석')) {
      return JSON.stringify({
        cause: '스크롤 속도가 비현실적으로 빠름',
        recommendations: ['스크롤 속도 20% 감소', '페이지 체류시간 증가'],
        pattern_adjustments: {
          scroll_speed: '-20%',
          dwell_time: '+30%'
        }
      });
    }

    return '{}';
  }

  /**
   * 프롬프트 템플릿 채우기
   */
  _fillPrompt(template, data) {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * 대기
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default AiQueueProcessor;
export { AiQueueProcessor, PROMPTS };
