define(["qlik"], function (qlik) {
	return {
		definition: {
			type: "items",
			component: "accordion",
			items: {
				appearance: {
					uses: "settings",
					items: { }
				}
			}
		},
		isBusy: false,
		paint: function ($element, layout) {
			var self = this;

			var loadingIcon = $('<div class="rain progress"><div class="rain-progress" style="height: 57.45px; width: 57.45px; left: 42%"><div class="progress-div rotating"></div></div></div>');

			var appSelect = $('<select style="margin-top: 6px;"/>').addClass('lui-select');
			var sheetSelect = $('<select style="margin-top: 6px;"/>').addClass('lui-select');
			var startButton = $('<button class="lui-button" style="margin-top: 6px;">Copy &amp; Paste</button>');
			var status = $('<div class="label"/>')
			var container = $('<div style="text-align: center;"/>')
							.append(loadingIcon)
							.append(appSelect)
							.append(sheetSelect)
							.append(startButton)
							.append(status);
			
			var copyFromApp;
			var currentApp = qlik.currApp();

			// fill select-list with qlik sense applications
			qlik.getAppList(function(apps) {
				apps.forEach(function(app) {
					appSelect.append($('<option>')
										.val(app.qDocId)
										.text(app.qDocName));
				});
				// trigger changed event once to load sheet list for first item 
				// ALTERNATIVE: use "PLEASE SELECT APP..." as first item
				appSelect.change();
			});

			// load sheet objects from selected application and fill sheet select-list on change
			appSelect.change(function(){
				var appId = appSelect.val();
				
				// close previous app
				if(copyFromApp)
					copyFromApp.close();

				copyFromApp = qlik.openApp(appId);

				// prevent user from switching apps while we're still loading
				loadingIcon.show();
				
				copyFromApp.getAppObjectList(function(appObjects){
					if(!appObjects || !appObjects.qAppObjectList || !appObjects.qAppObjectList.qItems) {
						console.warn('invalid response from getAppObjectList', appObjects);
						
						loadingIcon.hide();

						return;
					}

					// remove existing sheet-options
					sheetSelect.empty();

					// fill sheet select-list
					appObjects.qAppObjectList.qItems.forEach(function(object) {
						if(!object.qInfo || !object.qInfo.qType) {
							console.warn('invalid object in app object list', object);
							return;
						}

						if(object.qInfo.qType != 'sheet')
							return;

						sheetSelect.append($('<option>')
											.val(object.qInfo.qId)
											.text(object.qMeta.title));
					});
					
					loadingIcon.hide();
				});
			});

			startButton.click(function(){
				var sheetId = sheetSelect.val();

				if(!copyFromApp)
					return;		

				loadingIcon.show();

				// load sheet from source application
				copyFromApp.getObject(sheetId).then(sourceSheet => {
					console.log('source sheet:', sourceSheet);
					
					sourceSheet.getProperties().then(sourceSheetProperties => {
						console.log('source sheet props:', sourceSheetProperties);

						var promises = [];

						// loop over every object on source sheet
						sourceSheetProperties.cells.forEach(cell => {
							var getObjectProperties = copyFromApp.getObject(cell.name).then(co => co.getProperties());
							
							var createObjectPromise = getObjectProperties.then(sourceObjectProperties => {
								console.log('source object properties', sourceObjectProperties);
								
								// reset id so qlik sense can generate a new one 
								sourceObjectProperties.qInfo.qId = undefined;

								// create object in target application
								return currentApp.model.engineApp.createObject(sourceObjectProperties).then(newObject => { 
									console.log('created object:', newObject);

									// set cell name to objects id before creating new sheet
									cell.name = newObject.qInfo.id;
								});
							});

							promises.push(createObjectPromise);
						});

						// wait for every object to be created before proceeding
						return Promise.all(promises).then(() => sourceSheetProperties);
					}).then(sourceSheetProperties => {
						console.log('before create new sheet:', sourceSheetProperties);

						// reset id so qlik sense can generate a new one 
						// (?OPTIONAL?: maybe keep old id, maybe setting?)
						sourceSheetProperties.qInfo.qId = undefined;

						// set rank to 99 so sheet is appended to the end
						// TODO: load sheet-count from api and assign it to rank.
						sourceSheetProperties.rank = 99;

						// TODO: then with promise.all
						// create sheet using the properties of the source sheet
						currentApp.model.engineApp.createObject(sourceSheetProperties).then(newSheet => {
							console.log('created sheet:', newSheet);	
							
							status.text('"' + sourceSheetProperties.qMetaDef.title + '" copied successfully.')
							loadingIcon.hide();
						});		
					});		
				});
			});

			$element.html(container);
		}
	}
});