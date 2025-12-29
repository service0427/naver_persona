/**
 * 검색 관련 유틸리티
 * - 최근 검색어 추출
 * - 검색어 클릭 (확률적 선택)
 */

/**
 * 최근 검색어 목록 추출
 * @param {Page} page - Playwright page
 * @returns {Promise<Array<{query: string, rank: number, date: string}>>}
 */
export async function extractRecentSearches(page) {
  return await page.evaluate(() => {
    const items = document.querySelectorAll('#sb-kh-list li[data-query]');
    const results = [];

    items.forEach(item => {
      const query = item.getAttribute('data-query');
      const rank = parseInt(item.getAttribute('data-rank'), 10);
      const dateEl = item.querySelector('time');
      const date = dateEl ? dateEl.getAttribute('datetime') || dateEl.textContent.trim() : '';

      if (query) {
        results.push({ query, rank, date });
      }
    });

    return results;
  });
}

/**
 * 검색창 클릭 후 최근 검색어 가져오기
 * @param {Page} page - Playwright page
 * @returns {Promise<Array<{query: string, rank: number, date: string}>>}
 */
export async function getRecentSearchesWithClick(page) {
  // 검색창 클릭
  await page.click('#MM_SEARCH_FAKE');
  await page.waitForTimeout(800);

  // 최근 검색어 추출
  const searches = await extractRecentSearches(page);

  return searches;
}

/**
 * 최근 검색어 중 하나를 확률적으로 클릭
 * @param {Page} page - Playwright page
 * @param {number} probability - 클릭 확률 (0-1), 기본 0.3
 * @returns {Promise<{clicked: boolean, query: string|null}>}
 */
export async function maybeClickRecentSearch(page, probability = 0.3) {
  const searches = await extractRecentSearches(page);

  if (searches.length === 0) {
    return { clicked: false, query: null, reason: 'no_recent_searches' };
  }

  // 확률 체크
  if (Math.random() > probability) {
    return { clicked: false, query: null, reason: 'probability_skip' };
  }

  // 랜덤하게 하나 선택 (최근 것에 가중치)
  const weights = searches.map((_, i) => Math.max(1, searches.length - i));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  let selectedIndex = 0;
  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      selectedIndex = i;
      break;
    }
  }

  const selected = searches[selectedIndex];

  // 클릭
  await page.click(`#sb-kh-list li[data-query="${selected.query}"] a._kwd`);

  return { clicked: true, query: selected.query, rank: selected.rank };
}

export default {
  extractRecentSearches,
  getRecentSearchesWithClick,
  maybeClickRecentSearch
};
