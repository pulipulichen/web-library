'use strict';

import api from 'zotero-api-client';

const getApi = ({ config, libraryKey }, requestType, queryConfig) => {
	switch(requestType) {
		case 'TAGS_IN_COLLECTION':
			return api(config.apiKey, config.apiConfig)
				.library(libraryKey)
				.collections(queryConfig.collectionKey)
				.items()
				.top()
				.tags();
		case 'TAGS_IN_TRASH_ITEMS':
			return api(config.apiKey, config.apiConfig)
				.library(libraryKey)
				.items()
				.trash()
				.tags()
		case 'TAGS_IN_PUBLICATIONS_ITEMS':
			return api(config.apiKey, config.apiConfig)
				.library(libraryKey)
				.items()
				.publications()
				.tags()
		case 'TAGS_IN_ITEMS_BY_QUERY':
			var configuredApi = api(config.apiKey, config.apiConfig)
				.library(libraryKey)
				.items()
			if(queryConfig.collectionKey) {
				configuredApi = configuredApi.collections(queryConfig.collectionKey).top()
			} else if(queryConfig.isMyPublications) {
				configuredApi = configuredApi.publications();
			} else if(queryConfig.isTrash) {
				configuredApi = configuredApi.trash();
			} else {
				configuredApi = configuredApi.top();
			}
			return configuredApi.tags();
		case 'TAGS_FOR_ITEM':
			return api(config.apiKey, config.apiConfig)
				.library(libraryKey)
				.items(queryConfig.itemKey)
				.top()
				.tags();
		case 'TAGS_IN_TOP_ITEMS':
			return api(config.apiKey, config.apiConfig)
				.library(libraryKey)
				.items()
				.top()
				.tags();
		default:
		case 'TAGS_IN_LIBRARY':
			return api(config.apiKey, config.apiConfig)
				.library(libraryKey)
				.tags();
	}
}

const fetchTagsBase = (type, queryConfig, queryOptions = {}) => {
	return async (dispatch, getState) => {
		const state = getState();
		const config = state.config;
		const { libraryKey } = state.current;
		const api = getApi({ config, libraryKey }, type, queryConfig);

		dispatch({
			type: `REQUEST_${type}`,
			libraryKey, ...queryConfig, queryOptions
		});

		try {
			const response = await api.get(queryOptions);
			const tags = response.getData().map((tagData, index) => ({
				tag: tagData.tag,
				type: response.getMeta()[index]['type']
			}));
			const totalResults = parseInt(response.response.headers.get('Total-Results'), 10);

			dispatch({
				type: `RECEIVE_${type}`,
				libraryKey, tags, response, totalResults,
				...queryConfig, queryOptions
			});

			return tags;
		} catch(error) {
			dispatch({
				type: `ERROR_${type}`,
				libraryKey, error, ...queryConfig, queryOptions
			});

			throw error;
		}
	}
}

const fetchTagsInCollection = (collectionKey, queryOptions) => {
	return fetchTagsBase('TAGS_IN_COLLECTION', { collectionKey }, queryOptions);
};

const fetchTagsInLibrary = queryOptions => {
	return fetchTagsBase('TAGS_IN_LIBRARY', { }, queryOptions);
};

const fetchTagsForItem = (itemKey, queryOptions) => {
	return fetchTagsBase('TAGS_FOR_ITEM', { itemKey }, queryOptions);
};

const fetchTagsForTrashItems = queryOptions => {
	return fetchTagsBase('TAGS_IN_TRASH_ITEMS', {}, queryOptions);
};

const fetchTagsForPublicationsItems = queryOptions => {
	return fetchTagsBase('TAGS_IN_PUBLICATIONS_ITEMS', {}, queryOptions);
};

const fetchTagsForTopItems = queryOptions => {
	return fetchTagsBase('TAGS_IN_TOP_ITEMS', { }, queryOptions);
};

const fetchTagsForItemsByQuery = (query, queryOptions) => {
	const { collectionKey = null, itemTag = null, itemQ = null, itemQMode = null,
		isTrash, isMyPublications } = query;
	const queryConfig = { collectionKey, isTrash, isMyPublications };

	return fetchTagsBase(
		'TAGS_IN_ITEMS_BY_QUERY', queryConfig, { ...queryOptions, itemTag, itemQ, itemQMode }
	);
}

const fetchTags = queryOptions => {
	return async (dispatch, getState) => {
		const state = getState();
		const { collectionKey, tags, itemsSource, search, isMyPublications,
			isTrash, qmode, } = state.current;

		switch(itemsSource) {
			case 'top':
				return await dispatch(fetchTagsForTopItems(queryOptions));
			case 'trash':
				return await dispatch(fetchTagsForTrashItems(queryOptions));
			case 'publications':
				return await dispatch(fetchTagsForPublicationsItems(queryOptions));
			case 'collection':
				return await dispatch(fetchTagsInCollection(collectionKey, queryOptions));
			case 'query':
				return await dispatch(fetchTagsForItemsByQuery({
					isTrash,
					isMyPublications,
					collectionKey,
					itemQ: search,
					itemQMode: qmode,
					itemTag: tags
				}, queryOptions));
		}
	}
}

const checkColoredTags = queryOptions => {
	return async (dispatch, getState) => {
		const state = getState();
		const { libraryKey } = state.current;
		const coloredTags = Object.keys(state.libraries[libraryKey].tagColors);
		if(coloredTags.length === 0) { return; }
		const tagQuery = coloredTags.join(' || ');
		return await dispatch(fetchTags({ ...queryOptions, tag: tagQuery }));
	}
}

export {
	checkColoredTags,
	fetchTags,
	fetchTagsForItem,
	fetchTagsForItemsByQuery,
	fetchTagsForPublicationsItems,
	fetchTagsForTopItems,
	fetchTagsForTrashItems,
	fetchTagsInCollection,
	fetchTagsInLibrary,
};
