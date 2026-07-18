import SearchBox from '../../ui/SearchBox/SearchBox'
import './Header.css'

function Header() {
  return (
    <header className="header">
      <h1>TEST HEADER</h1>

      <div
        style={{
          width: 200,
          height: 50,
          background: 'green',
          color: 'white',
        }}
      >
        GREEN BOX
      </div>

      <SearchBox />
    </header>
  )
}

export default Header