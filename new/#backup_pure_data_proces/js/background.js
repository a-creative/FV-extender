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

var pendingRequests = new Object();
var total_requests = new Object();
var current_request = new Object();
var accept_options;
var current_app_id;
var requests_tab;
var status_window;
var current_app;
var aborted = false;
var accept_and_return_active = false;

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
		// Get gift id
		var matches;
		if ( matches = request['action_url'].match( /&gift=([^&]+)&/i ) ) {
			request.gift_id = matches[ 0 ];
		}	
		
		// Is seed
		if ( ( request.gift_id ) && ( request.gift_id.match( /seedpackage$/ ) ) ) {
			request[ 'IsSeed' ] = true;	
		}
		
		// It thank you gift
		if ( request['text'] && request['text'].match( /^Thank you for your gift/i ) ) {
			request[ 'IsThankYouGift' ] = true;
		}
		
		// Is material request		
		if ( request['action_url'] && request['action_url'].match( /sendmats\.php/ ) ) {
			request[ 'IsMaterialRequest' ] = true;
		}
		
		// Is one way gift
		if ( request['text'] && request['text'].match( /(?:don\'t|do not) (?:resend|send back)/ ) ) {
			request[ 'IsOneWayGift' ] = true;
		} 
		
		// Is shovel request
		if ( request['text'] && request['text'].match( /collecting Shovels in FarmVille/ ) ) {
			request[ 'IsShovelRequest' ] = true;
		} 
		
		// Is neigbor request
		if ( request['action_url'] && request['action_url'].match( /addneighbor\.php/ ) ) {
			request[ 'IsNeighborRequest' ] = true;	
		}
		
		// Has user text
		if ( request['user_text'] && request['user_text'] != '' ) {
			request[ 'HasUserText' ] = true;	
		} 
		
		// Is send by FV extender
		if ( request['user_text'] && request['user_text'].match( /This gift was returned by FV Extender/ ) ) {
			request[ 'IsSendByFvExtender' ] = true;				  
		}
		
		// Is bushel
		if ( request['action_url'] && request['action_url'].match( /gift_accept_crafting_ask_for_bushels/ ) ) {
			request[ 'IsBushel' ] = true;	
		}	
		
		grouped_requests.push( request );
	});
	
	return ( grouped_requests );	
}

function accept_all( params ) {
	
	var requests = group_requests( params.requests );
	
	total_requests[ params.app.id ] = requests.length
	pendingRequests[ params.app.id ] = requests;
	current_request[ params.app.id ] = null;
	current_app_id = params.app.id;	
	current_app = params.app;
	
	// Open window
	chrome.windows.create({
		"url" : "html/accept_all_options.html",
		"type" : "popup",
		"width" : 300,
		"height" : 220,
		"left" : params.wnd_x,
		"top" : params.wnd_y,
	}, function( wnd ) {
		status_window = wnd;
	});
}


function eval_request( request ) {	
	if ( 
				( request['IsThankYouGift'] ) 
			||	( request['IsMaterialRequest'] )
			||  ( request['IsOneWayGift'] )
			||  ( request['IsBushel'] ) 
			
	) {
		return 'accept'	
	} else if (
					( request[ 'IsNeighborRequest' ] )  
				||  ( request[ 'IsShovelRequest' ] )
				|| (
						( request['HasUserText'] )
					&&	( request['IsSendByFvExtender'] != true )
				)
	) { 
		return 'skip'				
	} else {
		return 'return_gift';		
	}
	
}

function update_status( sendResponse ) {
	
	var pct = 0;
	if ( total_requests[ current_app_id ] > 0 ) {	
		pct = 100 - ( ( pendingRequests[ current_app_id ].length * 100 ) / total_requests[ current_app_id ] );
		
	}
	
	sendResponse( { 
			pct: pct,
			total: total_requests[ current_app_id ],
			current: pendingRequests[ current_app_id ].length
	} );
}


function skip_request( request ) {
	//console.log('Skipping request:' + request['text'] );
	removeRequestFromUI( pendingRequests[ current_app_id ][ 0 ], function() {
		pendingRequests[ current_app_id ].shift();	
		accept_next();
	} );
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
			success: accept_request_ajax_result_page_success
		})
	}
}

function accept_request_ajax_result_page_success( data, textStatus, XMLHttpRequest ) { 
	var result_html = data;
	
	// Analyze result_html for: gift limits, errors
	
	
	// Remove request from UI
	removeRequestFromUI( pendingRequests[ current_app_id ][ 0 ], function() {
		// Remove request from queue
		pendingRequests[ current_app_id ].shift();
		
		// Accept next request
		accept_next();
	} );
}

function removeRequestFromUI( request, callback ) {
	 //console.log('Removing request with id: ' + request['id']  + 'from tab with id:' + requests_tab.id );
	
	 chrome.tabs.sendRequest( requests_tab.id, { action: "remove_request", request_id: request['id'] }, function(response) {
	 	callback();
	 });
}

function accept_request( request ) {
	//console.log('Accepting request:' + request['text'] + '...' );
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
	accept_and_return_active = true;
	
	var req_id = request.id;
	chrome.tabs.sendRequest( requests_tab.id, { action: "accept_and_return", request_id: request['id'] })
}

function accept_next() {
	//console.log('Accept next queried');
	//console.log('Accept next aborted: ' + aborted );
	//console.log('Accept next pending requests: ' + pendingRequests[ current_app_id ].length );
	
	if ( (!aborted) && ( pendingRequests[ current_app_id ].length ) ) {
		//console.log('Accept next initiated');
		
		var next_request = pendingRequests[ current_app_id ][ 0 ];
		//console.log('Accept next:' + next_request['text'] );
		
		
		setTimeout( function() {
			var eval_request_res = eval_request( next_request ) 
			if ( eval_request_res == 'skip' ) {
				skip_request( next_request );			
			} else if ( eval_request_res == 'accept' ) {
				skip_request( next_request );
				//accept_request( next_request )
			} else {
				accept_and_return( next_request );
			}
			
		}, 100 );
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
	if ( request.action == 'get_current_request' ) {
		sendResponse( { current_request : pendingRequests[ current_app_id ][ 0 ] } ); 	
		
	} else if ( request.action == 'accept_and_return_response' ) {
		console.log('accept_and_return_response');
		if ( accept_and_return_active == true ) {
			//console.log('accept_and_return_response IS ACTIVE');
			//accept_and_return_active = false;
			pendingRequests[ current_app_id ].shift();	
			accept_next();
		}				
	} else if ( request.action == 'get_accept_and_return_active' ) {
		sendResponse( {
			"accept_and_return_active" : accept_and_return_active	
		} );	
	} else if ( request.action == 'abort' ) {
		aborted = true;
	} else if ( request.action == 'done' ) {
		goto_game();
	} else if ( request.action == 'get_status' ) {
		update_status( sendResponse );		
	} else if ( request.action == 'accept_first' ) {
		aborted = false;
		accept_next();
	} else if ( request.action == 'accept_next' ) {
		accept_next();
	} else if ( request.action == 'set_accept_options' ) {
		accept_options = request.options;	
	} else if ( request.action == 'activate_accept_all' ) {
		requests_tab = sender.tab;
		
		accept_all( request );
	} else if ( request.action == 'get_handled_app' ) {
		get_handled_app( sendResponse, request.app_id );
	}
	
	sendResponse( {} );
} );

console.log('Background script ended.');