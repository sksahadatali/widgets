import Header from '../components/layout/Header/Header'
import TodaysBrief from '../components/modules/TodaysBrief/TodaysBrief'

function Home() {
  return (
    <main className="home-page">
      <Header />

      <div className="home-page__content">
        <TodaysBrief />
      </div>
    </main>
  )
}

export default Home