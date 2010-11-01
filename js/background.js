console.log('Loading background script...');
var apps = [
	{
		"id" 			: "102452128776",
		"name" 			: "FarmVille",
		"handled" 		: true,
		"Game_url" 		: 'http://www.farmville.com',
		"FB_url" 		: 'http://apps.facebook.com/onthefarm'
	}
];

var init_game_requests = new Object();
var total_init_game_requests = new Object();
var current_game_request = new Object();
var processed_game_requests_count = 0;
var accept_options;
var current_app_id;
var requests_tab;
var status_window;
var current_app;
var aborted = false;
var abort_info_id = '';
var accept_and_return_active = false;
var done = false;
var options = new Object();


function load_options( group ) {
	if ( ( localStorage[ group ] == undefined ) ) {
		localStorage[ group ] = "{}";
	}
	
	options[ group ] = JSON.parse( localStorage[ group ] );

}

function save_options( group ) {
	localStorage[ group ] = JSON.stringify( options[ group ] );
}

load_options( "accept_all" );

function get_handled_app( sendResponse, cand_app_id ) {
	var app;
	for ( var i = 0 ; i < apps.length; i++ ) {
		app = apps[ i ];	
		
		if ( app[ "id" ] == cand_app_id ) {
			if ( app[ "handled" ] ) {
				sendResponse( { app: app } );	
			}					
		}
	}		
	
	sendResponse( { app: null } );	
}

function group_requests( requests ) {
	
	var grouped_requests = new Array();
	jQuery.each( requests, function( i, request ) {		
		grouped_requests.push( group_request( request ) );
	});
	
	return ( grouped_requests );	
}

function accept_all( params ) {
	
	var requests = group_requests( params.requests );
	
	total_init_game_requests[ params.app.id ] = requests.length
	init_game_requests[ params.app.id ] = requests;
	current_app_id = params.app.id;	
	current_app = params.app;
	
	var whn = 235;
	bh = 15 + 60;
	var whb = whn + bh;
	var vh = whn;
	
	// Open window
	chrome.windows.create({
		"url" : "html/accept_all_options.html",
		"type" : "popup",
		"width" : 300,
		"height" : vh,
		"left" : params.wnd_x,
		"top" : params.wnd_y,
	}, function( wnd ) {
		status_window = wnd;
	});
}


function eval_request( request ) {	
	if ( 
				( request['IsWishGrant'] )
			||	( request['IsThankYouGift'] ) 
			||	( request['IsMaterialRequest'] )
			||  ( request['IsOneWayGift'] )
			||  ( request['IsBushel'] ) 
			
	) {
		return 'accept'	
	} else {
		return 'return_gift';		
	}
	
}

function update_status( sendResponse ) {
	
	var pct = 0;
	if ( total_init_game_requests[ current_app_id ] > 0 ) {	
		
		pct = ( processed_game_requests_count * 100 ) / total_init_game_requests[ current_app_id ] ;
		if ( pct > 100 ) {
			pct = 100;
		}
	}
	
	sendResponse( { 
			aborted: aborted,
			abort_info_id: abort_info_id,
			pct: pct,
			total: total_init_game_requests[ current_app_id ],
			status: processed_game_requests_count,
			done: done,
	} );
}


function skip_request( game_request ) {
	processed_game_requests_count++;
	accept_next();
}

function accept_request_ajax_success( data, textStatus, XMLHttpRequest ) {
	
	// Find result page URL in result data
	var temp_data = data;
					
	if ( matches = temp_data.match( /goURI\((\\".*?\\")/ ) ) {
		
		eval( "var URI_temp = '" + matches[ 1 ] + "'" );
		var URI = JSON.parse( URI_temp );
		
		// Request send gift result page
		$.ajax({
			type: "GET",
			url: URI,
			timeout: 10000,
			dataType: 'text',
			success: function( data, textStatus, XMLHttpRequest ) {
				accept_request_ajax_result_page_success( data, textStatus, XMLHttpRequest, URI );
			}
		})
	}
}

function accept_request_ajax_result_page_success( data, textStatus, XMLHttpRequest, result_page_url ) { 
	var result_html = data;
	
	// Analyze result_html for: gift limits, errors
	
	var body_start  = result_html.indexOf('<body>');
	var body_end	= result_html.indexOf('</body>', body_start );
	var body_html = result_html.slice( body_start + 6, body_end );
	
	// Handle limit errors
	if ( body_html.indexOf( 'class="giftLimit"' ) != -1 ) {
		aborted = true;
		
		if ( result_page_url.indexOf( 'gift_accept_crafting_ask_for_bushels' ) ) {
			// Handle bushel limit error
			abort_info_id = 'BUSHEL_LIMIT';	
		} else {				
			
			// Handle general limit error
			abort_info_id = 'GIFT_LIMIT';
		}
	}	
	
	// Remove request from UI
	removeRequestFromUI( current_game_request[ current_app_id ], function() {
		processed_game_requests_count++;
		accept_next();
	} );
}

function removeRequestFromUI( game_request, callback ) {
	 chrome.tabs.sendRequest( requests_tab.id, { action: "remove_request", request_id: game_request['id'] }, function(response) {
	 	callback();
	 });
}

function accept_request( request ) {
	console.log('Accepting request:' + request_to_string( request ) + '...' );
	$.ajax({
		type: "POST",
		timeout: 10000,
		url: 'http://www.facebook.com/ajax/reqs.php?__a=1',
		data: request.ajax_init_data,
		dataType: 'text',
		success: accept_request_ajax_success
	});
}

function accept_and_return( request ) {
	console.log('Accepting and return request:'+ request_to_string( request ) + '...' );
	
	accept_and_return_active = true;
	
	var req_id = request['id'];
	chrome.tabs.sendRequest( requests_tab.id, { action: "accept_and_return", request_id: request['id'] })
}

function accept_next() {
	if ( !aborted ) {
		
		// Only proces more requests if aborted is false
		chrome.tabs.sendRequest( requests_tab.id, { action: "get_next_request" }, function( game_request ) {
			
			// Get first of non-skiped game requests from frontend
			if ( game_request ) {
				
				//If more game requests found
				
				// Add extra attributes to the game request for grouping of game requests
				game_request = group_request( game_request );
				
				// Set game request currently under processing
				current_game_request[ current_app_id ] = game_request;
				
				// Decide what action to use on the game request
				var eval_request_res = eval_request( game_request ) 
				if ( eval_request_res == 'accept' ) {
					
					// Accept the game request(using ajax)
					accept_request( game_request )
				} else if ( eval_request_res = 'accept_and_return' ) {
					
					// Accept the game request and send return gift(using click)
					accept_and_return( game_request );
				} else {
					console.log( '2: Unexpected' );
				}
			} else {
				
				// If no more game requests found
				
				// Mark prosessing of game requests as done
				done = true;
			}	
		})
		
	}	
}

function goto_game() {
	chrome.windows.getCurrent( function( wnd ) {
		
		chrome.tabs.getAllInWindow( wnd.id, function( tabs ) {
			var found_tab;
			jQuery.each( tabs, function( i, tab ) {
				if (
						( tab.url.toLowerCase().indexOf( current_app.FB_url ) == 0 )
					||	( tab.url.toLowerCase().indexOf( current_app.Game_url ) == 0 )
				) {
					found_tab = tab;
					return false;
				}			
			} );
			
			if ( found_tab ) {
				chrome.tabs.update( 
					found_tab.id, {
						url : found_tab.url,
						selected: true,	
					}, 
					function() {
						if ( status_window ) {
							chrome.windows.remove( status_window.id );
						}		
					}
				);
			} else {
				chrome.tabs.create(
					{
						"windowId" : wnd.id,
						"url" : current_app.Game_url
					}, 
					function( tab ) {
						if ( status_window ) {
							chrome.windows.remove( status_window.id );
						}
					}
				);							
			}							
		});	
	} );	
}

chrome.extension.onRequest.addListener( function(request, sender, sendResponse) {
	if ( ( request.action == 'set_option' ) && ( request["option"] != undefined ) )  {
		
		if ( options[ request["group"] ] == undefined ) {
			options[ request["group"] ] = new Object();	
		}
		
		options[ request["group"] ][ request["option"] ] = request["value"];
		save_options( request["group"] );
		
		sendResponse( { "value" : request["value"] } );
	} else if ( ( request.action == 'get_option' ) && ( request["option"] != undefined ) ) {
		if ( options[ request["group"] ] == undefined ) {
			options[ request["group"] ] = new Object();	
		}
		
		var val = options[ request["group"] ][ request["option"] ];
		if ( ( val == undefined ) && ( request["group"] == 'accept_all' ) && ( request["option"] == 'return-gift-msg' ) ) {
			val = 'This gift was returned using FV Extender';
		}
		
		sendResponse( {
"value" : val } );
	} else if ( request.action == 'get_current_request' ) {
		sendResponse( { current_request : current_game_request[ current_app_id ] } ); 	
		
	} else if ( request.action == 'accept_and_return_response' ) {
		console.log('accept_and_return_response');
		if ( accept_and_return_active == true ) {
			//console.log('accept_and_return_response IS ACTIVE');
			accept_and_return_active = false;
			processed_game_requests_count++; 	
			accept_next();
		}				
	} else if ( request.action == 'done' ) {
		done = true;		
		accept_and_return_active = false;	
	} else if ( request.action == 'get_accept_and_return_active' ) {
		sendResponse( {
			"accept_and_return_active" : accept_and_return_active	
		} );	
	} else if ( request.action == 'abort' ) {
		aborted = true;
		
		if ( request.abort_info_id ) {
			abort_info_id = request.abort_info_id;
		}
		
	} else if ( request.action == 'goto_game' ) {
		goto_game();
	} else if ( request.action == 'get_status' ) {
		update_status( sendResponse );		
	} else if ( request.action == 'accept_first' ) {
		aborted = false;
		abort_info_id = '';
		processed_game_requests_count = 0;
		done = false;
		
		accept_next();
	} else if ( request.action == 'accept_next' ) {
		accept_next();
	} else if ( request.action == 'activate_accept_all' ) {
		requests_tab = sender.tab;
		
		accept_all( request );
	} else if ( request.action == 'get_handled_app' ) {
		get_handled_app( sendResponse, request.app_id );
	}
	
	sendResponse( {} );
} );

console.log('Background script ended.');