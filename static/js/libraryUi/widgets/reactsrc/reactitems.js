Zotero.ui.widgets.reactitems = {};

Zotero.ui.widgets.reactitems.init = function(el){
	Z.debug("widgets.items.init", 3);
	var library = Zotero.ui.getAssociatedLibrary(el);
	
	var reactInstance = ReactDOM.render(
		<ItemTable library={library} />,
		document.getElementById('library-items-div')
	);

	Zotero.ui.widgets.reactitems.reactInstance = reactInstance;

	library.listen("displayedItemsChanged", Zotero.ui.widgets.reactitems.loadItems, {widgetEl: el});
	library.listen("displayedItemChanged", reactInstance.selectDisplayed);
	Zotero.listen("selectedItemsChanged", function(){
		reactInstance.setState({selectedItemKeys:Zotero.state.getSelectedItemKeys()});
	});
	
	library.listen("loadMoreItems", Zotero.ui.widgets.reactitems.loadMoreItems, {widgetEl: el});
	library.listen("changeItemSorting", Zotero.ui.callbacks.resortItems, {widgetEl: el});

	//bind item links inside widget
	var container = J(el);
	Zotero.state.bindItemLinks(container);
	
	//monitor scroll position of items pane for infinite scrolling
	container.closest("#items-panel").on('scroll', function(e){
		if(Zotero.ui.widgets.reactitems.scrollAtBottom(J(this))){
			library.trigger("loadMoreItems");
		}
	});

	J(window).on('resize', function(){
		if(!window.matchMedia("(min-width: 768px)").matches){
			Zotero.ui.widgets.reactitems.reactInstance.setState({narrow:true});
		} else {
			Zotero.ui.widgets.reactitems.reactInstance.setState({narrow:false});
		}
    });
    
	library.trigger("displayedItemsChanged");
};

Zotero.ui.widgets.reactitems.loadItems = function(event){
	Z.debug('Zotero eventful loadItems', 3);
	var library = Zotero.ui.widgets.reactitems.reactInstance.props.library;
	var newConfig = Zotero.ui.getItemsConfig(library);
	
	//clear contents and show spinner while loading
	Zotero.ui.widgets.reactitems.reactInstance.setState({items:[], moreloading:true});
	
	var p = library.loadItems(newConfig)
	.then(function(response){
		if(!response.loadedItems){
			Zotero.error("expected loadedItems on response not present");
			throw("Expected response to have loadedItems");
		}
		library.items.totalResults = response.totalResults;
		Zotero.ui.widgets.reactitems.reactInstance.setState({items:response.loadedItems, moreloading:false, sort:newConfig.sort, order:newConfig.order});
	}).catch(function(response){
		Z.error(response);
		Zotero.ui.widgets.reactitems.reactInstance.setState({errorLoading:true, moreloading:false, sort:newConfig.sort, order:newConfig.order});
	});
	return p;
};

//load more items when the user has scrolled to the bottom of the current list
Zotero.ui.widgets.reactitems.loadMoreItems = function(event){
	Z.debug('loadMoreItems', 3);
	var widgetEl = J(event.data.widgetEl);
	//bail out if we're already fetching more items
	if(Zotero.ui.widgets.reactitems.reactInstance.state.moreloading){
		return;
	}
	//bail out if we're done loading all items
	if(Zotero.ui.widgets.reactitems.reactInstance.state.allItemsLoaded){
		return;
	}
	
	var reactInstance = Zotero.ui.widgets.reactitems.reactInstance;
	reactInstance.setState({moreloading:true});
	var library = reactInstance.props.library;
	var newConfig = Zotero.ui.getItemsConfig(library);
	var newStart = reactInstance.state.items.length;
	newConfig.start = newStart;

	var p = library.loadItems(newConfig)
	.then(function(response){
		if(!response.loadedItems){
			Zotero.error("expected loadedItems on response not present");
			throw("Expected response to have loadedItems");
		}
		var reactInstance = Zotero.ui.widgets.reactitems.reactInstance;
		var allitems = reactInstance.state.items.concat(response.loadedItems);
		reactInstance.setState({items:allitems, moreloading:false})

		//see if we're displaying as many items as there are in results
		var itemsDisplayed = allitems.length;
		if(response.totalResults == itemsDisplayed) {
			reactInstance.setState({allItemsLoaded:true});
		}
	}).catch(function(response){
		Z.error(response);
		Zotero.ui.widgets.reactitems.reactInstance.setState({errorLoading:true, moreloading:false});
	});
	
};

Zotero.ui.getItemsConfig = function(library){
	var effectiveUrlVars = ['tag', 'collectionKey', 'order', 'sort', 'q', 'qmode'];
	var urlConfigVals = {};
	J.each(effectiveUrlVars, function(index, value){
		var t = Zotero.state.getUrlVar(value);
		if(t){
			urlConfigVals[value] = t;
		}
	});
	
	var defaultConfig = {libraryID: library.libraryID,
						 libraryType: library.libraryType,
						 target:'items',
						 targetModifier: 'top',
						 limit: library.preferences.getPref('itemsPerPage'),
					 };
	
	var userPreferencesApiArgs = {
		order: Zotero.preferences.getPref('order'),
		sort: Zotero.preferences.getPref('sort'),
		limit: library.preferences.getPref('itemsPerPage'),
	};
	
	//Build config object that should be displayed next and compare to currently displayed
	var newConfig = J.extend({}, defaultConfig, userPreferencesApiArgs, urlConfigVals);
	//newConfig.start = parseInt(newConfig.limit, 10) * (parseInt(newConfig.itemPage, 10) - 1);
	
	//don't allow ordering by group only columns if user library
	if((library.libraryType == 'user') && (Zotero.Library.prototype.groupOnlyColumns.indexOf(newConfig.order) != -1)) {
		newConfig.order = 'title';
	}
	
	if(!newConfig.sort){
		newConfig.sort = Zotero.config.sortOrdering[newConfig.order];
	}
	
	//don't pass top if we are searching for tags (or query?)
	if(newConfig.tag || newConfig.q){
		delete newConfig.targetModifier;
	}
	
	return newConfig;
};

/**
 * Display the full library items section
 * @param  {Dom Element} el          Container
 * @param  {object} config      items config
 * @param  {array} loadedItems loaded items array
 * @return {undefined}
 */
/*
Zotero.ui.widgets.reactitems.displayItems = function(el, config={}, itemsArray=[]) {
	Z.debug("Zotero.ui.widgets.displayItems", 3);
	var library = Zotero.ui.widgets.reactitems.reactInstance.props.library;
	
	var filledConfig = J.extend({}, Zotero.config.defaultApiArgs, config);
	var displayFields = library.preferences.getPref('listDisplayedFields');
	if(library.libraryType != 'group'){
		displayFields = J.grep(displayFields, function(el, ind){
			return J.inArray(el, Zotero.Library.prototype.groupOnlyColumns) == (-1);
		});
	}
	
	Zotero.ui.widgets.reactitems.reactInstance.setState({items:itemsArray, displayFields:displayFields})
};
*/
Zotero.ui.callbacks.resortItems = function(e){
	Z.debug(".field-table-header clicked", 3);
	var widgetEl = J(e.data.widgetEl);
	var library = Zotero.ui.getAssociatedLibrary(widgetEl);
	var currentSortField = Zotero.ui.getPrioritizedVariable('order', 'title');
	var currentSortOrder = Zotero.ui.getPrioritizedVariable('sort', 'asc');
	var newSortField;
	var newSortOrder;
	if(e.newSortField){
		newSortField = e.newSortField;
	}
	else {
		newSortField = J(e.triggeringElement).data('columnfield');
	}
	if(e.newSortOrder){
		newSortOrder = e.newSortOrder;
	}
	else{
		newSortOrder = Zotero.config.sortOrdering[newSortField];
	}
	
	//only allow ordering by the fields we have
	if(J.inArray(newSortField, Zotero.Library.prototype.sortableColumns) == (-1)){
		return false;
	}
	
	//change newSort away from the field default if that was already the current state
	if((!e.newSortOrder) && currentSortField == newSortField && currentSortOrder == newSortOrder){
		if(newSortOrder == 'asc'){
			newSortOrder = 'desc';
		}
		else{
			newSortOrder = 'asc';
		}
	}
	
	//problem if there was no sort column mapped to the header that got clicked
	if(!newSortField){
		Zotero.ui.jsNotificationMessage("no order field mapped to column");
		return false;
	}
	
	//update the url with the new values
	Zotero.state.pathVars['order'] = newSortField;
	Zotero.state.pathVars['sort'] = newSortOrder;
	Zotero.state.pushState();
	
	//set new order as preference and save it to use www prefs
	library.preferences.setPref('sortField', newSortField);
	library.preferences.setPref('sortOrder', newSortOrder);
	library.preferences.setPref('order', newSortField);
	library.preferences.setPref('sort', newSortOrder);
	Zotero.preferences.setPref('order', newSortField);
	Zotero.preferences.setPref('sort', newSortOrder);
};

Zotero.ui.widgets.reactitems.scrollAtBottom = function(el) {
	if(J(el).scrollTop() + J(el).innerHeight() >= J(el)[0].scrollHeight){
	  return true;
   }
   return false;
};

var ItemTable = React.createClass({
	getDefaultProps: function() {
		return {};
	},
	getInitialState: function() {
		return {
			moreloading:false,
			allItemsLoaded:false,
			errorLoading:false,
			items:[],
			selectedItemKeys:[],
			allSelected:false,
			displayFields: ["title", "creator", "dateModified"],
			order: "title",
			sort: "asc",
			narrow: false
		};
	},
	//select and highlight in the itemlist the item  that is displayed
	//in the item details widget
	selectDisplayed: function() {
		Z.debug('widgets.items.selectDisplayed', 3);
		Zotero.state.selectedItemKeys = [];
		this.setState({selectedItemKeys: Zotero.state.getSelectedItemKeys(), allSelected:false});
	},
	fixTableHeaders: function() {
		var tableEl = this.refs.itemsTable;
		var tel = J(tableEl);
	    var colWidths = [];
	    tel.find("tbody tr").first().find("td").each(function(ind, th){
	        var width = J(th).width();
	        colWidths.push(width);
	        tel.find("thead th").eq(ind).width(width);
	    });

	    var bodyOffset = tel.find("thead").height();

	    tel.find("thead").css('position', 'fixed').css('margin-top', -bodyOffset).css('background-color', 'white').css('z-index', 10);
	    tel.find("tbody").css('margin-top', bodyOffset);
	    tel.css("margin-top", bodyOffset);
	},
	handleSelectAllChange: function(ev) {
		let nowselected = [];
		let allSelected = false;
		if(ev.target.checked){
			allSelected = true;
			//select all items
			this.state.items.forEach(function(item){
				nowselected.push(item.get('key'));
			});
		} else {
			let selectedItemKey = Zotero.state.getUrlVar('itemKey');
			if(selectedItemKey){
				nowselected.push(selectedItemKey);
			}
		}
		Zotero.state.selectedItemKeys = nowselected;
		this.setState({selectedItemKeys:nowselected, allSelected:allSelected});
		this.props.library.trigger("selectedItemsChanged", {selectedItemKeys: nowselected});

		//if deselected all, reselect displayed item row
		if(nowselected.length === 0){
			this.props.library.trigger('displayedItemChanged');
		}
	},
	newSortOrder: function() {

	},
	nonreactBind: function() {
		Zotero.eventful.initTriggers();
		if(J("body").hasClass('lib-body')){
			this.fixTableHeaders(J("#field-table"));
		}
	},
	componentDidMount: function() {
		this.nonreactBind();
	},
	componentDidUpdate: function() {
		this.nonreactBind();
	},
	render: function() {
		var narrow = this.state.narrow;
		var order = this.state.order;
		var sort = this.state.sort;
		var loading = this.state.moreloading;
		var libraryString = this.props.library.libraryString;
		var selectedItemKeys = this.state.selectedItemKeys;
		var selectedItemKeyMap = {};
		selectedItemKeys.forEach(function(itemKey) {
			selectedItemKeyMap[itemKey] = true;
		});

		var sortIcon;
		if(sort == "desc"){
			sortIcon = (<span className="glyphicons fonticon chevron-down pull-right"></span>);
		} else {
			sortIcon = (<span className="glyphicons fonticon chevron-up pull-right"></span>);
		}
		
		var headers = [(
			<th key="checkbox-header">
				<input type='checkbox'
				className='itemlist-editmode-checkbox all-checkbox'
				name='selectall'
				checked={this.state.allSelected}
				onChange={this.handleSelectAllChange} />
			</th>
		)];
		if(narrow){
			headers.push(
				<th key="single-cell-header" className="eventfultrigger clickable" data-library={library.libraryString} data-triggers="chooseSortingDialog">
                    {Zotero.Item.prototype.fieldMap[order]}
                    {sortIcon}
                </th>
			);
		} else {
			var fieldHeaders = this.state.displayFields.map(function(header, ind){
				var sortable = Zotero.Library.prototype.sortableColumns.indexOf(header) != -1;
				var selectedClass = ((header == order) ? "selected-order sort-" + sort + " " : "");
				var sortspan = null;
				if(header == order) {
					sortspan = sortIcon;
				}
				return (<th 
					key={header}
					data-triggers="changeItemSorting"
					className={"field-table-header eventfultrigger " + selectedClass + (sortable ? "clickable " : "")}
					data-columnfield={header}
					data-library={libraryString}>
						{Zotero.Item.prototype.fieldMap[header] ? Zotero.Item.prototype.fieldMap[header] : header}
						{sortspan}
					</th>
				);
			});
			headers = headers.concat(fieldHeaders);
		}

		var itemRows = this.state.items.map(function(item){
			var selected = selectedItemKeyMap.hasOwnProperty(item.get('key')) ? true : false;
			if(narrow){
				return (
					<SingleCellItemRow key={item.get("key")} item={item} selected={selected} />
				);
			} else {
				return (
					<ItemRow key={item.get("key")} item={item} selected={selected} />
				);
			}
		});
		return (
			<form className="item-select-form" method='POST'>
				<table id='field-table' ref="itemsTable" className='wide-items-table table table-striped'>
					<thead>
						<tr>
							{headers}
						</tr>
					</thead>
					<tbody>
						{itemRows}
					</tbody>
				</table>
				<LoadingError errorLoading={this.state.errorLoading} />
				<LoadingSpinner loading={this.state.moreloading} />
			</form>
		);
		
	}
});

var ItemRow = React.createClass({
	getDefaultProps: function() {
		return {
			displayFields: ["title", "creatorSummary", "dateModified"],
			selected: false,
			item: {}
		};
	},
	handleSelectChange: function(ev) {
		var itemKey = this.props.item.get('key');
		Zotero.state.toggleItemSelected(itemKey);
		selected = Zotero.state.getSelectedItemKeys();
		
		Zotero.ui.widgets.reactitems.reactInstance.setState({selectedItemKeys:selected});
		Zotero.ui.widgets.reactitems.reactInstance.props.library.trigger("selectedItemsChanged", {selectedItemKeys: selected});
	},
	render: function() {
		var item = this.props.item;
		var selected = this.props.selected;
		var fields = this.props.displayFields.map(function(field){
			return (
				<ItemField key={field} field={field} item={item} />
			)
		});
		return (
			<tr className={selected ? "highlighed" : ""}>
				<td className="edit-checkbox-td" data-itemkey={item.get("key")}>
					<input type='checkbox' onChange={this.handleSelectChange} checked={selected} className='itemlist-editmode-checkbox itemKey-checkbox' name={"selectitem-" + item.get("key")} data-itemkey={item.get("key")} />
				</td>
				{fields}
			</tr>
		)
	}
});

var SingleCellItemRow = React.createClass({
	getDefaultProps: function() {
		return {
			displayFields: ["title", "creatorSummary", "dateModified"],
			selected: false,
			item: {}
		};
	},
	handleSelectChange: function(ev) {
		var itemKey = this.props.item.get('key');
		Zotero.state.toggleItemSelected(itemKey);
		selected = Zotero.state.getSelectedItemKeys();

		Zotero.ui.widgets.reactitems.reactInstance.setState({selectedItemKeys:selected});
		Zotero.ui.widgets.reactitems.reactInstance.props.library.trigger("selectedItemsChanged", {selectedItemKeys: selected});
	},
	render: function() {
		var item = this.props.item;
		var selected = this.props.selected;
		
		return (
			<tr className={selected ? "highlighed" : ""} data-itemkey={item.get('key')}>
				<td className="edit-checkbox-td" data-itemkey={item.get('key')}>
					<input type='checkbox' className='itemlist-editmode-checkbox itemKey-checkbox' name={"selectitem-" + item.get('key')} data-itemkey={item.get('key')} />
				</td>
				
				<SingleCellItemField item={item} displayFields={this.props.displayFields} />
			</tr>
		)
	}
});

var SingleCellItemField = React.createClass({
	render: function() {
		var item = this.props.item;
		var field = this.props.field;

		var pps = [];
		this.props.displayFields.forEach(function(field){
			var fieldDisplayName = Zotero.Item.prototype.fieldMap[field] ? Zotero.Item.prototype.fieldMap[field] + ":" : "";
			if(field == "title"){
				pps.push(<span key="itemTypeIcon" className={'sprite-icon pull-left sprite-treeitem-' + item.itemTypeImageClass()}></span>);
				pps.push(<ColoredTags key="coloredTags" item={item} />);
				pps.push(<b key="title">{Zotero.ui.formatItemField(field, item, true)}</b>);
			} else if((field === 'dateAdded') || (field === 'dateModified')) {
				pps.push(
					<p key={field} title={item.get(field)} dangerouslySetInnerHtml={{__html:fieldDisplayName + Zotero.ui.formatItemDateField(field, item, true)}}>
						
					</p>
				);
			} else {
				pps.push(
					<p key={field} title={item.get(field)}>{fieldDisplayName}{Zotero.ui.formatItemField(field, item, true)}</p>
				);
			}
		});
		return (
			<td className='single-cell-item' data-itemkey={item.get('key')}>
				<a className='item-select-link' data-itemkey={item.get('key')} href={Zotero.url.itemHref(item)}>
					{pps}
				</a>
			</td>
		);
	}
});

var ColoredTags = React.createClass({
	render: function() {
		var item = this.props.item;
		var library = item.owningLibrary;

		var coloredTags = library.matchColoredTags(item.apiObj._supplement.tagstrings);
		Z.debug("coloredTags:" + JSON.stringify(coloredTags));

		return (
			<span className="coloredTags">

			</span>
		);
	}
});

var ColoredTag = React.createClass({
	render: function() {
		var styleObj = {color:this.props.color};
		return (
			<span style={styleObj}>
				<span style={styleObj} className="glyphicons fonticon glyphicons-tag"></span>
			</span>
		);
	}
});

var ItemField = React.createClass({
	render: function() {
		var item = this.props.item;
		var field = this.props.field;
		return (
			<td className={field} data-itemkey={item.get("key")}>
				<a className='item-select-link' data-itemkey={item.get("key")} href={Zotero.url.itemHref(item)} title={item.get(field)}>
					{Zotero.ui.formatItemField(field, item, true)}
				</a>
			</td>
		);
	}
});

var LoadingSpinner = React.createClass({
	render: function() {
		var spinnerUrl = Zotero.config.baseWebsiteUrl + '/static/images/theme/broken-circle-spinner.gif';
		return (
			<div className="items-spinner" hidden={!this.props.loading}>
				<img className='spinner' src={spinnerUrl} />
			</div>
		);
	}
});

var LoadingError = React.createClass({
	render: function() {
		return (
			<p hidden={!this.props.errorLoading}>
				There was an error loading your items. Please try again in a few minutes.
			</p>
		);
	}
});
