function toggleDarkMode(){
    var body = document.body
    var links = document.getElementsByTagName('a')

    body.classList.toggle('darkmode')

    for (i in links){
        links[i].classList.toggle('darkmode')
    }
}