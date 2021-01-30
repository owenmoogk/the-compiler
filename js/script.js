// code to pull xml data and put it into a table, add a seach function, and a sort function

// load xml file and send requests and stuff
var xmlhttp;

function loadXML() {
    // make new http request, its a js thing
    xmlhttp = new XMLHttpRequest();

    // GET, file location and name, and some other propertie i forget
    xmlhttp.open("GET", "/assets/data.xml", true);
    xmlhttp.send();

    // when there is a change in the request's state, itll check all is green and run the table loading function
    xmlhttp.onreadystatechange = function(){
        // all green
        if (this.readyState == 4 && this.status == 200) {
            loadTable(this);
        }
        // cant find the xml
        if(this.status == 404) {
            console.log("couldn't find the xml file")
        }
    }
}

function loadTable(xml) {
    var i; // current row
    var file = xml.responseXML; // js thingy, its todo with the request
    var table=""; // the varible that will hold the data with its needed html elements
    var x = file.getElementsByTagName("resource"); // picks out just the resources aka "<resource>"

    // loops through all <resource>'s and addes them to the great table varible
    for (i = 0; i < x.length; i++) {
        // addes the table row html tag, and table cell tag
        // the getElements then addes the each info bit to a coloum so to put it
        // lastly, there are a ending tags added
        table += "<tr><td><a href='"+
        x[i].getElementsByTagName("link")[0].childNodes[0].nodeValue+
        "' target = '_blank'>" +
        x[i].getElementsByTagName("title")[0].childNodes[0].nodeValue +
        "</a></td><td>" +
        x[i].getElementsByTagName("description")[0].childNodes[0].nodeValue +
        "</td><td style='font-style:italic;'>" +
        x[i].getElementsByTagName("category")[0].childNodes[0].nodeValue +
        "</td></tr>";
    }
    // sets the html inside the empty table we made to be the great table varible we just made
    document.getElementById("demo").innerHTML = table;
    // by default sort the table by name
    sortTable('title')
}

// search function. the search bar searches through name and description
function search() {
    var filter = document.getElementById("searchBar").value.toUpperCase(); // input from search bar set to upper case so the serach is not case-senesative
    var table = document.getElementById("demo"); // pulls table from html table
    var tableRow = table.getElementsByTagName("tr"); // pulls all the tablerows

    // theses two varibles will hold the title/description of the row we're running through
    var title, description, category; 

    // will run throuhg all the rows
    for (i = 0; i < tableRow.length; i++) {
        title = tableRow[i].getElementsByTagName("td")[0].innerText; // pulls first entry (aka the title) of row "i"
        description = tableRow[i].getElementsByTagName("td")[1].innerText; // pulls second entry (aka description) of row "i"
        category = tableRow[i].getElementsByTagName("td")[2].innerText;

        // checks if the title or description matches the filter (search bar input)
        if (title.toUpperCase().indexOf(filter) > -1 || description.toUpperCase().indexOf(filter) > -1 || category.toUpperCase().indexOf(filter) > -1) {
            // if it does, it'll just leave it alone
            tableRow[i].style.display = "";
        }
        else {
            // if it doesnt itll change its display style in css to "none", which basiclly just hides it
            tableRow[i].style.display = "none";
        }
    }
}

// sorting function. will sort either by the name or the category. there will be both ascending and descending sorting
// the fuction takes in a value (sortBy). this value index of the thing being sorted in a tablerow, so 0 is name, and 2 is category
function sortTable(){
    // variables UwU
    var file = xmlhttp.responseXML;
    var x = file.getElementsByTagName("resource"); // picks out just the resources aka "<resource>"
    let sortedList = []; // initialize a list to be sorted

    // get a sorted list sorted by the sortBy value
    for (i = 0; i < x.length; i++){
        value = x[i].getElementsByTagName(sortBy)[0].childNodes[0].nodeValue // gets the value to push to the list
        sortedList.push(value); // pushed value to list
    }
    sortedList.sort(); // sorts list

    let table = [];
    let idsPassed = [];
    for (p = 0; p < sortedList.length; p++) {
        for (w = 0; w < x.length; w++){

            let doContinue = false;

            let title = x[w].getElementsByTagName("title")[0].childNodes[0].nodeValue;
            let category = x[w].getElementsByTagName("category")[0].childNodes[0].nodeValue
            let description = x[w].getElementsByTagName("description")[0].childNodes[0].nodeValue
            let id = x[w].getElementsByTagName("id")[0].childNodes[0].nodeValue
            let link = x[w].getElementsByTagName("link")[0].childNodes[0].nodeValue

            for (idCycler = 0; idCycler < idsPassed.length; idCycler++){
                if (idsPassed[idCycler] == id){
                    doContinue = true;
                }
            }
            if (doContinue == true){
                continue;
            }

            if (sortBy == 'title'){
                if (title == sortedList[p]){
                    table += "<tr><td><a href='"+link+"' target = '_blank'>" + title + "</td><td>" + description + "</td><td>" + category + "</td></tr>";
                    idsPassed.push(id);
                    break;
                }
            }
            if (sortBy == 'category'){
                if (category == sortedList[p]){
                    table += "<tr><td><a href='"+link+"' target = '_blank'>" + title + "</td><td>" + description + "</td><td>" + category + "</td></tr>";
                    idsPassed.push(id);
                    break;
                }
            }
        }
    }
    // sets the html inside the empty table we made to be the great table varible we just made
    document.getElementById("demo").innerHTML = table;

    // lastly call search function to show and hide proper ones
    search();

    // change button to say sort by other thing
    var button = document.getElementById('sort-button')
    
    if (sortBy == 'title'){
        button.innerText = 'Sort by Category'
        sortBy = 'category'
    }
    else{
        button.innerText = 'Sort by Name'
        sortBy = 'title'
    }
}

// sort by title at first
var sortBy = 'title'