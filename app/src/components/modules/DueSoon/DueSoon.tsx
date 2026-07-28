import {
    AlertCircle,
    Clock3,
  } from 'lucide-react';
  
  import { useDueSoon } from '../../../hooks/useDueSoon';
  
  import './DueSoon.css';
  
  function DueSoon() {
    const {
      tasks,
      loading,
      error,
      refresh,
    } = useDueSoon();
  
    return (
      <section className="due-soon">
        <div className="due-soon__header">
          <div className="due-soon__heading">
            <Clock3
              size={21}
              strokeWidth={2}
              aria-hidden="true"
            />
  
            <h2>Due Soon</h2>
          </div>
  
          {!loading && !error && (
            <span className="due-soon__count">
              {tasks.length} items
            </span>
          )}
        </div>
  
        {loading ? (
          <div className="due-soon__state">
            Loading tasks...
          </div>
        ) : error ? (
          <div className="due-soon__state due-soon__state--error">
            <span>
              Unable to load tasks
            </span>
  
            <button
              type="button"
              onClick={refresh}
            >
              Retry
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="due-soon__state">
            Nothing due in the next 7 days.
          </div>
        ) : (
          <div className="due-soon__list">
            {tasks.map((task) => (
              <div
                className="due-soon__item"
                key={task.id}
              >
                <div
                  className={`due-soon__indicator due-soon__indicator--${task.dueState}`}
                />
  
                <div className="due-soon__content">
                  <span className="due-soon__task">
                    {task.task}
                  </span>
  
                  <span className="due-soon__area">
                    {task.area}
                  </span>
                </div>
  
                <span
                  className={`due-soon__date due-soon__date--${task.dueState}`}
                >
                  {task.dueState ===
                    'overdue' && (
                    <AlertCircle
                      size={14}
                      aria-hidden="true"
                    />
                  )}
  
                  {task.dueLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }
  
  export default DueSoon;