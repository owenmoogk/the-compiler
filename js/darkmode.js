function toggleDarkMode(firstTime){
    body = document.body
    body.classList.toggle('lightmode')
    links = document.getElementsByTagName("a")
    for (i in links){
        if (i == "length"){
            break
        }
        links[i].classList.toggle("lightmode")
    }
    if (!firstTime){
        if (localStorage.lightMode == "true"){
            localStorage.lightMode = "false"
        }
        else{
            localStorage.lightMode = "true"
        }
    }
}

function darkModeStorageCheck(){
    if (localStorage.lightMode == "true"){
        toggleDarkMode(true)
        console.log("OIiii")
    }
}