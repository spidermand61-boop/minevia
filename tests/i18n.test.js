import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage, normalizeLocale, setLanguage, t, minesText, translations } from '../js/i18n.js';
import { defaults, parseSave, SaveStore } from '../js/save.js';

test('device language normalization, preference order and English fallback', () => {
  for (const [locale, expected] of [['en-US','en'],['en-GB','en'],['uk-UA','uk'],['uk','uk'],['ru-RU','ru'],['ru','ru'],['de-DE','en']]) {
    assert.equal(detectLanguage({languages:[locale],language:'en-US'}), expected);
    assert.equal(detectLanguage({language:locale}), expected);
  }
  assert.equal(normalizeLocale(' UK_ua '), 'uk');
  assert.equal(detectLanguage({languages:['uk-UA','en-US'],language:'ru'}), 'uk');
  assert.equal(detectLanguage({languages:['de-DE','uk-UA']}), 'en');
  assert.equal(detectLanguage({languages:[],language:'ru-RU'}), 'ru');
  assert.equal(detectLanguage({languages:[''],language:'uk'}), 'uk');
  assert.equal(detectLanguage({}), 'en');
});
test('manual preference takes priority; Auto restores device language', () => {
  const device = {languages:['uk-UA']};
  assert.equal(setLanguage('ru',device), 'ru');
  assert.equal(t('Settings'), 'Настройки');
  assert.equal(setLanguage('en',device), 'en');
  assert.equal(setLanguage('auto',device), 'uk');
  assert.equal(t('Settings'), 'Налаштування');
  assert.equal(t('missing.key'), 'missing.key');
  assert.equal(t('__proto__'), '__proto__');
  assert.equal(t('Personal high score: {score}',{score:42}), 'Особистий рекорд: 42');
});
test('all dictionaries have matching keys and interpolation parameters', () => {
  for (const lang of ['uk','ru']) {
    assert.deepEqual(Object.keys(translations[lang]),Object.keys(translations.en));
    for (const [key,value] of Object.entries(translations.en)) if(typeof value==='string')
      assert.deepEqual([...translations[lang][key].matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(), [...value.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),`${lang}: ${key}`);
  }
});
test('mine counts use Intl plurals including Slavic teens and 21/22/25', () => {
  for (const [lang, expected] of [
    ['en',['1 mine','2 mines','5 mines','10 mines','11 mines','21 mines','22 mines','25 mines']],
    ['uk',['1 міна','2 міни','5 мін','10 мін','11 мін','21 міна','22 міни','25 мін']],
    ['ru',['1 мина','2 мины','5 мин','10 мин','11 мин','21 мина','22 мины','25 мин']]]) {
    setLanguage(lang);
    assert.deepEqual([1,2,5,10,11,21,22,25].map(minesText),expected);
  }
});
test('language migrates safely in v1 saves and persists through the existing adapter', async () => {
  for (const language of ['auto','en','uk','ru']) {
    let raw='';const store=new SaveStore({load:async()=>raw,save:async s=>{raw=s;},score:async()=>true});
    await store.load();store.data.settings.language=language;store.schedule(true);
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(parseSave(raw).data.settings.language,language);
    assert.equal(raw.includes('"version":1'),true);
  }
  const old=defaults();delete old.settings.language;
  assert.equal(parseSave(JSON.stringify(old)).data.settings.language,'auto');
  for (const language of ['de','__proto__',null,42]) {
    old.settings.language=language;
    assert.equal(parseSave(JSON.stringify(old)).data.settings.language,'auto');
  }
});
