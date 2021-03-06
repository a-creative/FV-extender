console.log( 'Loading ui_event.js');

function get_item_name( text ) {
	
	var item_name = false;
	
	var matches = text.match( /Special Delivery/ );								
	if ( matches ) {
		item_name = "Special Delivery"
	} else {
	
		var matches = text.match( /Here is (.+) for your farm/ );
		if ( matches ) {
			item_name = matches[ 1 ]
		} else {
			
			var matches = text.match( /Give (?:a|an) (.+) and get one too/ );
			
			if ( matches ) {
				item_name = matches[ 1 ]
			} else {
				item_name = 'Help request';	
			}
		}
	}
	
	item_name = item_name.replace( /^(?:a|an) /, '' );
	
	return item_name;
}

function Process_requests( app_requests ) {
	var app_request;
	var app_request_id;
	var app_request_text;
	var app_request_item_name;
	var item_name;
	
	chrome.extension.sendRequest( { "action" : "get_processed_ids" }, function( processed_ids ) {
		
		chrome.extension.sendRequest( { "action" : "get_options" }, function( options ) {
		
			chrome.extension.sendRequest( { "action" : "update_badge_text", count:  app_requests.length } );
			
			var i;
			var request_count = app_requests.length;
			
			// Optionally perform weekly test
			if ( options.weekly_test && ( request_count <= 50 ) ) {
				
				var item_count = {};
				for ( i = 0; i < app_requests.length; i++ ) {
					app_request = app_requests[ i ] ;

					// Get app request id
					try {
						app_request_text = document.evaluate(".//div[contains(@class,'appRequestBodyNewA')]", app_request, null, XPathResult.ANY_TYPE, null).iterateNext().textContent;
						
						app_request_item_name = get_item_name( app_request_text );

						if ( isNaN( item_count[ app_request_item_name ] ) ) {
							item_count[ app_request_item_name ] = 0;
						} 
						
						item_count[ app_request_item_name ]++;
						
					
					} catch( err ) {

						console.log('FAILED at index:' + i + ' - ' + app_requests[ i ] );
						continue;
					}
				}
				
				var stats = '';
				for ( var item_name in item_count ) {
					stats += item_count[ item_name ] + 'x\t' + item_name + '\n';						
				}
				console.log( stats );
				
				handled = true;
				chrome.extension.sendRequest( { "action" : "stop_processing", "ptype" : 3 }, _statsLoaded );
				
				return;
			}	
			

			// Find request and click
			for ( i = 0; i < app_requests.length; i++ ) {
				app_request = app_requests[ i ];

				if ( options.useAlternativeDataPage ) {

					try {
						app_request_id = $(app_request ).attr('id');;
					} catch( err ) {
						console.log( err );
						continue;
					}

				} else {

					// Get app request id
					try {
						app_request_id = document.evaluate(".//input[contains(@name,'div_id')]", app_request, null, XPathResult.ANY_TYPE, null).iterateNext().value;
					} catch( err ) {
						try {
							app_request_id = document.evaluate(".//input[contains(@id,'div_id')]", app_request, null, XPathResult.ANY_TYPE, null).iterateNext().value;

						} catch( err ) {
							console.log( err );
							continue;
						}
					}

				}
				
				// Set to accept as default
				var action = 'accept';
				var delay = 0;
				if ( typeof processed_ids[ app_request_id ] != 'undefined' ) {
					
					// If request has already been processed
					
					if ( processed_ids[ app_request_id ] == 1 ) {
						
						// If it has only been processed one time				
						action = 'reject';
						delay = 10000;
						
					} else if ( processed_ids[ app_request_id ] > 2 ) {
						
						// If it has been processed several times
						
						// Then stop processing due to problems with rejecting requests
						action = 'reject';	
						delay = 10000 + ( 500 * processed_ids[ app_request_id ] );
					}
				}
				
				if ( action == 'accept' ) {
					if ( ( options.settings.rejectGifts == 'true' ) && ( app_request_item_name != 'Help request' ) ) {
						action = 'reject';
						delay = 10000;
					} else if ( ( options.settings.rejectNeighbors == 'true' ) && ( app_request_text.match( /Howdy friend\! How'd you like to be neighbors/ ) ) ) {
						action = 'reject';
						delay = 10000;
					}	
				}
				
				console.log(action + ':' + app_request_item_name + ' : "' + app_request_text + '"' );
				
				// Find the appropiate button and click it
				var action_btn;
				if ( action == 'accept' ) {
					
					// Set it as the current id in backend
					chrome.extension.sendRequest( { "action" : "set_current_id", "current_id" : app_request_id, "current_text" : app_request_text, "current_item_name" : app_request_item_name }, function( app_request_id ) {
						
						action_btn = document.evaluate(".//button[starts-with(@name,'actions[accept') or starts-with(@name,'actions[http')]", app_request, null, XPathResult.ANY_TYPE, null).iterateNext();
						if (!action_btn) {
							action_btn = document.evaluate(".//input[starts-with(@name,'actions[accept') or starts-with(@name,'actions[http')]", app_request, null, XPathResult.ANY_TYPE, null).iterateNext();
						}

						console.log('Clicking:' + app_request_id + ':' + app_request );

                        var slowDownDelay = 0;
                        if ( options.settings.bandwidthUse !=='' ) {
                            slowDownDelay = 1000 * parseInt( options.settings.bandwidthUse );
                        }

						setTimeout( function() {
                            // Check for hang
                            chrome.extension.sendRequest( { "action" : "check_for_hang", "app_request_id" : app_request_id } );
                            action_btn.click();
                        }, slowDownDelay );
						
					} );
					break;
				} else if ( action == 'reject' ) {
					request_count--;
					chrome.extension.sendRequest( { "action" : "update_badge_text", count:  request_count } );

					action_btn = document.evaluate(".//button[starts-with(@name,'actions[reject')]", app_request, null, XPathResult.ANY_TYPE, null).iterateNext();
					if (!action_btn) {
						action_btn = document.evaluate(".//input[starts-with(@name,'actions[reject')]", app_request, null, XPathResult.ANY_TYPE, null).iterateNext();
					}
					
					action_btn.click();
					setTimeout( function() {
						chrome.extension.sendRequest( { "action" : "finish_reject", "processed_id" : app_request_id }, function() {
							window.location.reload();
						});	
					}, delay );
					break;
				}
				
			}				
			
			// Check if all shown requests were rejected
			if ( request_count == 0 ) {				
				
				// There was requests but they were all skipped or rejected. So we're done!
				handled = true;				
				chrome.extension.sendRequest( { "action" : "stop_processing", "ptype" : 1 }, _processingDone );				
			}
		} );
	} );	
}

function Find_requets() {

	chrome.extension.sendRequest( { "action" : "get_options" }, function( options ) {

		var ignored_el = jQuery( '.pas.uiBoxYellow' );
		if ( ignored_el && ignored_el.length ) {
			if_not_detected( ignored_el, function ( ignored_el ) {

				var parent = ignored_el.parent();
				if ( parent && parent.length ) {

					var app_request_id = parent.attr( 'id' );

					chrome.extension.sendRequest( {
						"action"      : "finish_reject",
						"processed_id": app_request_id
					}, function () {
						window.location.reload();
					} );
					return;
				}
			} );
		}

		// Find app request group
		var app_request_group = jQuery( '#confirm_102452128776' );
		if ( options.settings.useAlternativeDataPage ) {
			app_request_group = jQuery( '#requests_102452128776');
		}

		if ( app_request_group && app_request_group.length ) {

			var app_requests = app_request_group.find( ".requests > li" );
			if ( options.settings.useAlternativeDataPage ) {
				app_requests = app_request_group.find( "> ul > div" );
			}

			if ( app_requests && app_requests.length ) {

				if_not_detected( app_requests, function() {

			        // Requets found

			        // Process requests found
			        Process_requests( app_requests );

			    });
			}
		}
	} );
}

function checkFinishPage( result, callback ) {
	var content_el;
	if ( result.useAlternativeDataPage === 'true' ) {
		content_el = document.evaluate("//div[@id='games_hub_root_content']", window.document, null, XPathResult.ANY_TYPE, null).iterateNext();
	} else {
		content_el = document.evaluate("//h3[contains(@class,'uiHeaderTitle')]", window.document, null, XPathResult.ANY_TYPE, null).iterateNext();
	}

	var check_path = result.def_data_page_check;

	if ( result.useAlternativeDataPage === 'true' ) {
		check_path = result.alt_data_page_check;
	}

	var right_url = ( document.location.href.indexOf(check_path) !==-1 );

	if ( content_el && right_url ) {
		callback();
	} else {
		var reason = '';
		
		if ( !content_el ) {
			reason += ' "no post form id el" '
		}
		
		if (!right_url) {
			reason += ' "not right url: \'' + document.location.href + '\'" ';
		}
		
		chrome.extension.sendRequest( { "action" : "check_for_list_reload", "reason" : reason }, function( result ) {

			if ( result.do_reload ) {
			    window.location.replace( result.data_page_url );
			}
		} );
	}
}

function _processingDone( result ) {
	
	if ( result.error ) {
		alert ( 'ERROR:' + result.error );	
	} else {
		alert( 'Processing is done.\n\nFVE currently only handles FV requests!' );
		console.log('ptype:' + result.ptype );
	}
}

function _statsLoaded( stats ) {
	alert( 'Stats loaded');
}
