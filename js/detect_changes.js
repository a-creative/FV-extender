console.log( 'Loading detect_changes.js...');

function if_not_detected( el, func ) {
	if ( el.attr( 'FV_Extender_detected' ) != 'true' ) {
		el.attr('FV_Extender_detected', 'true' );
		func( el );
	}	
}

function if_not_detected_XPATH( el, func ) {
	if ( el.getAttribute( 'FV_Extender_detected' ) != 'true' ) {
		el.setAttribute( 'FV_Extender_detected', 'true' );
		func( el );
	}	
}

function callLast(func, t){
		if(!t){ t = 100; }
		var callLastTimeout = null; 
		return function(){
				if(callLastTimeout!==null){
						window.clearTimeout(callLastTimeout); 
				}
				callLastTimeout = window.setTimeout(function(){ callLastTimeout = null; func(); }, t);
		};
}

function run_detect_changes(){		
		function work(){
			removeWorker();
			changes_detected();
			addWorker();
		}

		var workLast = callLast(work);
		function addWorker(){       document.addEventListener("DOMSubtreeModified", workLast, false); }
		function removeWorker(){ document.removeEventListener("DOMSubtreeModified", workLast, false); } 
		function startWork(){ addWorker(); workLast(); }

		startWork();
}



console.log( 'detect_changes.js loaded.');