import TodaysBrief from '../components/modules/TodaysBrief/TodaysBrief';
import TodaysFocus from '../components/modules/TodaysFocus/TodaysFocus';

import './Home.css';

function Home() {
  return (
    <main className="home">
      <div className="home__brief">
        <TodaysBrief />
      </div>

      <div className="home__focus">
        <TodaysFocus />
      </div>
    </main>
  );
}

export default Home;