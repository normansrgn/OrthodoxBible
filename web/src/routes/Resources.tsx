export function Resources() {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <h1 className="h1">🙏 Молитвы и чтение</h1>
        <div className="muted">
          Здесь — быстрые ссылки на те же разделы, что и в боте (открываются на azbyka.ru).
        </div>

        <div className="grid two" style={{ marginTop: 6 }}>
          <div className="panel" style={{ padding: 14, background: 'rgba(255,255,255,0.03)' }}>
            <div className="h2">Молитвослов</div>
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <a className="btn" href="https://azbyka.ru/molitvoslov/molitvy-utrennie.html" target="_blank" rel="noreferrer">Утреннее правило</a>
              <a className="btn secondary" href="https://azbyka.ru/molitvoslov/molitvy-na-son-gryadushhim.html" target="_blank" rel="noreferrer">На сон грядущим</a>
              <a className="btn secondary" href="https://azbyka.ru/molitvoslov/posledovanie-ko-svyatomu-prichashheniyu.html" target="_blank" rel="noreferrer">Ко Причащению</a>
              <a className="btn secondary" href="https://azbyka.ru/molitvoslov/blagodarstvennye-molitvy-po-svyatom-prichashhenii.html" target="_blank" rel="noreferrer">Благодарственные</a>
              <a className="btn secondary" href="https://azbyka.ru/molitvoslov/" target="_blank" rel="noreferrer">Полный сборник</a>
            </div>
          </div>

          <div className="panel" style={{ padding: 14, background: 'rgba(255,255,255,0.03)' }}>
            <div className="h2">Закон Божий</div>
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <a className="btn" href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/1" target="_blank" rel="noreferrer">О вере и добродетели</a>
              <a className="btn secondary" href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/2" target="_blank" rel="noreferrer">О Боге и Его свойствах</a>
              <a className="btn secondary" href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/12" target="_blank" rel="noreferrer">Священная история (ВЗ)</a>
              <a className="btn secondary" href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/30" target="_blank" rel="noreferrer">Священная история (НЗ)</a>
              <a className="btn secondary" href="https://azbyka.ru/otechnik/Serafim_Slobodskoj/zakon-bozhij/" target="_blank" rel="noreferrer">Полный учебник</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

