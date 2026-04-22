function buildInfoPage(info) {
  const template = fs.readFileSync(path.join(__dirname, 'info_page.html'), 'utf8');

  const announcement = info.announcement
    ? `<div class="announcement" data-reveal>
        <div class="announcement-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"/>
            <path d="M10 21a2 2 0 0 0 4 0"/>
          </svg>
        </div>
        <div>
          <h3>Зар мэдээ</h3>
          <p>${esc(info.announcement)}</p>
        </div>
      </div>`
    : '';

  const services = (info.services || '')
    .split(',')
    .map((s, i) => `<span class="service-pill" style="animation-delay:${i * 70}ms">${esc(s.trim())}</span>`)
    .join('');

  const social = [
    info.facebook ? `<span class="social-chip">Facebook · ${esc(info.facebook)}</span>` : '',
    info.instagram ? `<span class="social-chip">Instagram · ${esc(info.instagram)}</span>` : '',
  ].filter(Boolean).join('') || '<span class="social-chip muted">Удахгүй нэмэгдэнэ</span>';

  return template
    .replace(/HERO_TITLE_PLACEHOLDER/g, esc(info.hero_title))
    .replace(/HERO_TEXT_PLACEHOLDER/g, esc(info.hero_text))
    .replace(/ADDRESS_PLACEHOLDER/g, esc(info.address))
    .replace(/PHONE_PLACEHOLDER/g, esc(info.phone))
    .replace(/HOURS_PLACEHOLDER/g, esc(info.hours).replace('|', '<br>'))
    .replace(/SOCIAL_PLACEHOLDER/g, social)
    .replace(/SERVICES_PLACEHOLDER/g, services)
    .replace(/ANNOUNCEMENT_PLACEHOLDER/g, announcement);
}
