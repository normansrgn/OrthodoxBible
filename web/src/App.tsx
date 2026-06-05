import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './routes/Home'
import { Bible } from './routes/Bible'
import { ReadChapter } from './routes/ReadChapter'
import { Search } from './routes/Search'
import { RandomVerse } from './routes/RandomVerse'
import { Bookmarks } from './routes/Bookmarks'
import { Psalter } from './routes/Psalter'
import { Calendar } from './routes/Calendar'
import { Resources } from './routes/Resources'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/bible" element={<Bible />} />
        <Route path="/read/:bookId/:chapterId" element={<ReadChapter />} />
        <Route path="/search" element={<Search />} />
        <Route path="/random" element={<RandomVerse />} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/psalter" element={<Psalter />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
