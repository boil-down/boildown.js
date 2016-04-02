
var bdReader = (function() {

	return {
		open: load
	}

	function load(file, onSuccess) {
	  var request = new XMLHttpRequest();
	  request.onreadystatechange = function() {
		if (request.readyState == 4 && request.status == 200) {
		  onSuccess(request.responseText);
		}
	  };
	  request.open("GET", file, true);
	  request.send();
	}

})();
