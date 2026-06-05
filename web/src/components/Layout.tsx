import { NavLink, Outlet, useLocation } from 'react-router-dom'

function TopLink(props: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={props.to}
      className={({ isActive }) =>
        [
          'btn',
          'secondary',
          isActive ? 'active' : '',
        ].join(' ')
      }
      style={({ isActive }) => ({
        borderColor: isActive ? 'rgba(212,175,55,0.65)' : undefined,
      })}
    >
      {props.children}
    </NavLink>
  )
}

export function Layout() {
  const loc = useLocation()

  return (
    <div style={{ padding: '18px 0 40px' }}>
      <header className="container" style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <div className="h2">
            <span className="gold">☦</span> Святая Библия
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            чтение, поиск, календарь, молитвы
          </div>
        </div>

        <nav style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <TopLink to="/bible">Библия</TopLink>
          <TopLink to="/search">Поиск</TopLink>
          <TopLink to="/random">Случайный стих</TopLink>
          <TopLink to="/psalter">Псалтирь</TopLink>
          <TopLink to="/calendar">Календарь</TopLink>
          <TopLink to="/bookmarks">Закладки</TopLink>
          <TopLink to="/resources">Молитвы</TopLink>
        </nav>
      </header>

      <main className="container">
        <Outlet key={loc.pathname} />
      </main>

      <footer className="container" style={{ marginTop: 18, opacity: 0.85, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div className="muted">Сайт работает локально в браузере (закладки хранятся на устройстве).</div>
          <a className="muted" href="https://azbyka.ru/" target="_blank" rel="noreferrer">
            Источник календаря: azbyka.ru
          </a>
        </div>
      </footer>
    </div>
  )
}

