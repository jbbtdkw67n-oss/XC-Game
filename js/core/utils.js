(function () {
  const Utils = {};

  Utils.clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  Utils.average = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  Utils.sum = (arr) => arr.reduce((a, b) => a + b, 0);

  let idCounter = 1;
  Utils.generateId = (prefix = 'id') => `${prefix}_${(idCounter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  Utils.capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  Utils.ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  Utils.formatDate = (week, year) => `Week ${week}, ${year}`;

  // Simple weighted rating -> letter grade for UI display (A+ down to F)
  Utils.ratingGrade = (value) => {
    if (value >= 95) return 'A+';
    if (value >= 90) return 'A';
    if (value >= 85) return 'A-';
    if (value >= 80) return 'B+';
    if (value >= 75) return 'B';
    if (value >= 70) return 'B-';
    if (value >= 65) return 'C+';
    if (value >= 60) return 'C';
    if (value >= 55) return 'C-';
    if (value >= 50) return 'D+';
    if (value >= 45) return 'D';
    if (value >= 40) return 'D-';
    return 'F';
  };

  Utils.escapeHtml = (str) => {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  Utils.debounce = (fn, wait = 200) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  window.XCD.core.Utils = Utils;
})();
