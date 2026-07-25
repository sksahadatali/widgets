import TodaysBrief from '../components/modules/TodaysBrief/TodaysBrief';
import TodaysFocus from '../components/modules/TodaysFocus/TodaysFocus';
import QuickStatus from '../components/modules/QuickStatus/QuickStatus';

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

      <div className="home__status">
          <QuickStatus />
      </div>
    </main>
  );
}

export default Home;