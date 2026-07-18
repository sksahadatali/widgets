import './SearchBox.css'
import { Search } from 'lucide-react'

type SearchBoxProps = {
  placeholder?: string
}

function SearchBox({ placeholder = 'Search' }: SearchBoxProps) {
  return (
    <div className="search-box">
      <Search
        className="search-box__icon"
        size={18}
        strokeWidth={2}
      />

      <input
        className="search-box__input"
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  )
}

export default SearchBox