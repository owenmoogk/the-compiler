import { useEffect, useState } from 'react';
import './style.css';
import GithubCorner from './GithubCorner'

export default function App() {

  const [data, setData] = useState()
  const [darkMode, setDarkMode] = useState(false)
  const [sortedBy, setSortedBy] = useState('alpha')

  useEffect(() => {
    fetch('data.json')
      .then(response => response.json())
      .then(json => setData(json))
  }, [])

  function sortTable(sortBy) {

    setSortedBy(sortBy)

    function shouldSwap(node1, node2, sortBy){
      if (sortBy == 'category'){
        if (node1.childNodes[2].innerText > node2.childNodes[2].innerText){
          return(true)
        }
        return(false)
      }
      if (sortBy == 'alpha'){
        if (node1.childNodes[0].innerText > node2.childNodes[0].innerText){
          return(true)
        }
        return(false)
      }
    }

    var table = document.getElementById('table').childNodes[0]
    var nodes = table.childNodes

    for (var i = 0; i < nodes.length; i++){
      for (var j = 1; j < nodes.length; j++){
        if (shouldSwap(nodes[j-1], nodes[j], sortBy)){
          table.insertBefore(nodes[j], nodes[j-1])
        }
      }
    }
  }

  function search(searchBy){
    var table = document.getElementById('table').childNodes[0]
    var nodes = table.childNodes

    for (var i = 0; i < nodes.length; i++){
      if (nodes[i].innerText.toLowerCase().includes(searchBy.toLowerCase())){
        nodes[i].style.display = ''
      }
      else{
        nodes[i].style.display = 'none'
      }
    }
    
  }

  return (
    <div className="App">
      <GithubCorner />
      <style dangerouslySetInnerHTML={{
        __html:
          darkMode
            ? `
            :root{
              --backgroundColor: black;
              --textColor: white;
              --themeColor: blue;
            }
          `
            : `
            :root{
              --backgroundColor: white;
              --textColor: black;
              --themeColor: lightblue;
            }
          `
      }}>
      </style>
      <h1>The Compiler</h1>
      <div className="head">

        <input type="text" id="searchBar" onKeyUp={(e) => search(e.target.value)} placeholder="Search" title="Type to search" />
        <button onClick={() => setDarkMode(!darkMode)} className="dark-button">
          <img src="darkmode.png" />
        </button>
        {sortedBy == 'alpha'
          ? <button onClick={() => sortTable('category')} id="sort-button">Sort by Category</button>
          : <button onClick={() => sortTable('alpha')} id="sort-button">Sort Alphabetically</button>
        }
      </div>

      <div className="tableHolder">
        <table id="table">
          <tbody>
            {data
              ? data.map((item, key) => {
                return (
                  <tr key={key}>
                    <td>
                      <a href={item.link} target="blank" rel='noreferrer'>
                        {item.title}
                      </a>
                    </td>
                    <td>
                      {item.description}
                    </td>
                    <td>
                      {item.category}
                    </td>
                  </tr>
                )
              })
              : null
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}