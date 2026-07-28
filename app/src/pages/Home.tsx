import TodaysBrief from '../components/modules/TodaysBrief/TodaysBrief';
import TodaysFocus from '../components/modules/TodaysFocus/TodaysFocus';
import QuickStatus from '../components/modules/QuickStatus/QuickStatus';
import DueSoon from '../components/modules/DueSoon/DueSoon';
import Tasks from '../components/modules/Tasks/Tasks';

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

      <div className="home__due-soon">
        <DueSoon />
      </div>

      <div className="home__tasks">
        <Tasks />
      </div>
    </main>
  );
}

export default Home;