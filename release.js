(function (global) {
    'use strict';
    const appId = 'ru.cmykcolors.crm';
    const maxDescriptorBytes = 65536;
    let configuration = null;

    function validateRelease(raw, config) {
        const fail = () => { throw new Error('Unverified release descriptor'); };
        if (!config || config.applicationId !== appId || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/cmykcolors-android-releases$/.test(config.repository)) fail();
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schemaVersion !== 1 || raw.applicationId !== appId) fail();
        if (!Number.isInteger(raw.versionCode) || raw.versionCode < 1 || raw.versionCode > 2147483647) fail();
        if (typeof raw.versionName !== 'string' || !/^(0|[1-9]\d{0,6})\.(0|[1-9]\d{0,6})\.(0|[1-9]\d{0,6})$/.test(raw.versionName)) fail();
        if (!Number.isInteger(raw.minSdk) || raw.minSdk < 26 || raw.minSdk > 100) fail();
        if (!Number.isSafeInteger(raw.apkSizeBytes) || raw.apkSizeBytes < 1 || raw.apkSizeBytes > 512*1024*1024) fail();
        if (typeof raw.apkSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(raw.apkSha256)) fail();
        if (typeof raw.releaseNotes !== 'string' || raw.releaseNotes.length > 16000) fail();
        if (typeof raw.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(raw.publishedAt)) fail();
        const date = new Date(raw.publishedAt);
        if (!Number.isFinite(date.getTime()) || date.toISOString() !== raw.publishedAt.replace('Z','.000Z')) fail();
        function github(value) {
            if (typeof value !== 'string' || value.length > 500) fail();
            let url; try { url = new URL(value); } catch (_) { fail(); }
            if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) fail();
            if (url.href !== value) fail();
            return url.pathname;
        }
        const prefix = '/'+config.repository+'/releases/';
        const releasePath = github(raw.releaseUrl);
        const tag = releasePath.slice((prefix+'tag/').length);
        if (releasePath !== prefix+'tag/'+tag || ![raw.versionName,'v'+raw.versionName].includes(tag)) fail();
        if (github(raw.apkUrl) !== prefix+'download/'+tag+'/CMYK.apk') fail();
        return Object.freeze({schemaVersion:1,versionCode:raw.versionCode,versionName:raw.versionName,applicationId:appId,
            minSdk:raw.minSdk,publishedAt:raw.publishedAt,apkUrl:raw.apkUrl,apkSizeBytes:raw.apkSizeBytes,
            apkSha256:raw.apkSha256,releaseNotes:raw.releaseNotes,releaseUrl:raw.releaseUrl});
    }
    function renderRelease(descriptor, config = configuration) {
        const download = document.getElementById('download');
        const history = document.getElementById('history');
        // Remove old links before touching untrusted metadata or showing a failure state.
        for (const element of [download,history]) { element.hidden = true; element.removeAttribute('href'); }
        document.getElementById('release-detail').hidden = true;
        if (descriptor === null) {
            document.getElementById('release-title').textContent = 'Готовим первый выпуск';
            document.getElementById('release-status').textContent = 'Ссылка на приложение появится здесь после проверки готовой версии.';
            return;
        }
        const release = validateRelease(descriptor,config);
        document.getElementById('release-title').textContent = 'Версия '+release.versionName;
        document.getElementById('release-status').textContent = 'Приложение готово к скачиванию';
        document.getElementById('release-date').textContent = 'Выпущено '+new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow'}).format(new Date(release.publishedAt));
        document.getElementById('release-notes').textContent = release.releaseNotes;
        document.getElementById('download-size').textContent = (release.apkSizeBytes/(1024*1024)).toLocaleString('ru-RU',{maximumFractionDigits:1})+' МБ';
        const versions={26:'8.0',27:'8.1',28:'9',29:'10',30:'11',31:'12',32:'12L',33:'13',34:'14',35:'15',36:'16',37:'17'};
        document.getElementById('android-version').textContent = versions[release.minSdk] ? 'Android '+versions[release.minSdk]+' и новее' : 'Требуется более новая версия Android';
        download.href = release.apkUrl; download.hidden = false;
        history.href = 'https://github.com/'+config.repository+'/releases'; history.hidden = false;
        document.getElementById('release-detail').hidden = false;
    }
    async function jsonFile(file, maximum, signal) {
        const response = await fetch(file,{cache:'no-store',credentials:'omit',redirect:'error',signal});
        if (file === 'latest.json' && response.status === 404) return null;
        if (!response.ok || Number(response.headers.get('content-length')) > maximum || !response.body) throw new Error('Release unavailable');
        const reader=response.body.getReader(); const parts=[]; let size=0;
        try {
            while (true) {
                const item=await reader.read(); if (item.done) break;
                size += item.value.byteLength; if (size>maximum) throw new Error('Descriptor too large');
                parts.push(item.value);
            }
        } finally { await reader.cancel().catch(() => {}); }
        const bytes=new Uint8Array(size); let position=0;
        for (const part of parts) { bytes.set(part,position); position += part.byteLength; }
        return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    }
    async function loadRelease() {
        const controller=new AbortController(); const timeout=setTimeout(() => controller.abort(),10000);
        try {
            configuration=await jsonFile('release-config.json',2048,controller.signal);
            const descriptor=await jsonFile('latest.json',maxDescriptorBytes,controller.signal);
            renderRelease(descriptor);
        } catch (_) {
            renderRelease(null);
            document.getElementById('release-title').textContent = 'Не удалось проверить версию';
            document.getElementById('release-status').textContent = 'Попробуйте открыть страницу позже. Скачать приложение можно будет после успешной проверки версии.';
        } finally { clearTimeout(timeout); }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports={validateRelease,renderRelease};
    else { global.CmykRelease={validateRelease,renderRelease}; document.addEventListener('DOMContentLoaded',loadRelease); }
})(typeof window !== 'undefined' ? window : globalThis);
