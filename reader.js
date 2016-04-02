
var bdReader = (function() {

	return {
		open: load
	}

	function load(file, onSuccess, onError) {
	  var request = new XMLHttpRequest();
	  request.onreadystatechange = function() {
		if (request.readyState == 4 && request.status == 200) {
			onSuccess(request.responseText);
		} else if (onError) {
			onError(request.status);
		}
	  };
	  request.open("GET", file, true);
	  request.send();
	}

})();
