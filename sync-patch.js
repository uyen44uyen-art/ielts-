/**
 * IELTS Sync Patch — v1.0
 * Tự động fetch bài tập mới từ GitHub Gist khi học sinh vào trang.
 *
 * CÁCH DÙNG:
 *   1. Thay GIST_RAW_URL bên dưới bằng URL lấy từ sync-tool.html
 *   2. Thêm vào cuối file HTML web học sinh (trước </body>):
 *      <script src="sync-patch.js"></script>
 */

(function() {
  'use strict';

  /* ====================================================
   * ⚙️  CẤU HÌNH — chỉ cần đổi dòng này
   * ==================================================== */
  const GIST_RAW_URL = 'https://gist.githubusercontent.com/uyen44uyen-art/4734c454b015dde84dfbdeb2b1655b97/raw/36f5bde36eba9c240e693c3421c8fd193c6ee013/ielts-exercises.json';
  /* ==================================================== */

  const CACHE_KEY   = 'ielts_remote_exercises';
  const CACHE_TS    = 'ielts_remote_exercises_ts';
  const CACHE_TTL   = 5 * 60 * 1000; // 5 phút cache để không spam GitHub

  if (!GIST_RAW_URL || GIST_RAW_URL === 'PASTE_YOUR_GIST_RAW_URL_HERE') {
    console.warn('[IELTS Sync] Chưa cấu hình GIST_RAW_URL. Bỏ qua sync.');
    return;
  }

  /* Inject thêm nhỏ vào UI để học sinh biết trạng thái */
  function showSyncBadge(state, text) {
    let badge = document.getElementById('__ielts_sync_badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = '__ielts_sync_badge';
      badge.style.cssText = [
        'position:fixed', 'bottom:16px', 'right:16px',
        'padding:6px 12px', 'border-radius:20px',
        'font-size:11px', 'font-weight:600',
        'z-index:99999', 'pointer-events:none',
        'transition:opacity 0.3s', 'opacity:1',
        'font-family:-apple-system,sans-serif'
      ].join(';');
      document.body.appendChild(badge);
    }
    const styles = {
      loading: 'background:#1e1a40;color:#9d8ff9;border:1px solid #534AB7',
      success: 'background:#0d2a1e;color:#3dd68c;border:1px solid #0F6E56',
      cached:  'background:#1c1c20;color:#5a5a72;border:1px solid #2e2e38',
      error:   'background:#2a0f0f;color:#f26b6b;border:1px solid #993535',
    };
    badge.style.cssText += ';' + (styles[state] || styles.cached);
    badge.textContent = text;
    if (state === 'success' || state === 'cached') {
      setTimeout(() => { if (badge) badge.style.opacity = '0'; }, 3000);
      setTimeout(() => { if (badge) badge.remove(); }, 3400);
    }
  }

  /**
   * Merge bài tập từ Gist vào dữ liệu local của web.
   * Logic: gist exercises ghi đè lên bất kỳ exercise cùng key (topic+band+index).
   */
  function mergeExercises(remoteData) {
    if (!remoteData) return;

    const exercises = remoteData.exercises || remoteData.topics || remoteData;
    if (!Array.isArray(exercises) || exercises.length === 0) return;

    // Web gốc lưu bài tập trong nhiều key có thể có — ta thử các key phổ biến
    const LOCAL_KEYS = ['exerciseBank', 'ielts_exercises', 'exercises'];
    let stored = null, usedKey = null;

    for (const k of LOCAL_KEYS) {
      const val = localStorage.getItem(k);
      if (val) { try { stored = JSON.parse(val); usedKey = k; break; } catch(e) {} }
    }

    if (!stored) {
      // Không có local data — lưu thẳng remote vào tất cả key
      LOCAL_KEYS.forEach(k => localStorage.setItem(k, JSON.stringify(exercises)));
      console.log(`[IELTS Sync] Đã tải ${exercises.length} bài tập (fresh).`);
      return;
    }

    // Merge: remote thắng nếu cùng key nhận dạng
    const localArr = Array.isArray(stored) ? stored : Object.values(stored);
    const makeKey = ex => `${ex.topic||''}_${ex.band||''}_${ex.lessonIndex||ex.index||ex.id||''}`;
    const localMap = new Map(localArr.map(ex => [makeKey(ex), ex]));

    let added = 0, updated = 0;
    exercises.forEach(ex => {
      const k = makeKey(ex);
      if (localMap.has(k)) updated++; else added++;
      localMap.set(k, ex);
    });

    const merged = Array.from(localMap.values());
    LOCAL_KEYS.forEach(k => localStorage.setItem(k, JSON.stringify(merged)));
    console.log(`[IELTS Sync] Merge xong: +${added} bài mới, ~${updated} bài cập nhật.`);

    // Trigger sự kiện để web tự reload nếu cần
    window.dispatchEvent(new CustomEvent('ielts:exercises:updated', { detail: { added, updated, exercises: merged } }));
  }

  async function fetchAndSync() {
    // Kiểm tra cache TTL
    const lastFetch = parseInt(localStorage.getItem(CACHE_TS) || '0');
    const now = Date.now();

    if (now - lastFetch < CACHE_TTL) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        showSyncBadge('cached', '✓ Đã đồng bộ');
        return;
      }
    }

    showSyncBadge('loading', '⟳ Đang tải bài mới...');

    try {
      // Thêm cache buster để tránh browser cache
      const url = GIST_RAW_URL + (GIST_RAW_URL.includes('?') ? '&' : '?') + '_t=' + now;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // Lưu cache
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TS, String(now));

      mergeExercises(data);
      showSyncBadge('success', '✓ Bài tập đã cập nhật!');

    } catch(e) {
      console.warn('[IELTS Sync] Không thể fetch Gist:', e.message);
      // Dùng cache cũ nếu có
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try { mergeExercises(JSON.parse(cached)); } catch(_) {}
        showSyncBadge('cached', '✓ Dùng dữ liệu cache');
      } else {
        showSyncBadge('error', '✗ Không tải được bài');
      }
    }
  }

  // Chạy sau khi DOM load xong
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchAndSync);
  } else {
    fetchAndSync();
  }

  // Expose để web gọi thủ công nếu cần: window.ieltsSyncForceRefresh()
  window.ieltsSyncForceRefresh = async function() {
    localStorage.removeItem(CACHE_TS);
    await fetchAndSync();
  };

})();
