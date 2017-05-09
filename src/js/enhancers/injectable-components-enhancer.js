'use strict';

import React from 'react';
import components from '../components';

function injectablesFromProps(props) {
	let injectedComponents = {};
	for(let propName of Object.keys(props)) {
		if(propName.startsWith('inject')) {
			let baseClassName = propName.substr(6);
			let replacementClassName = props[propName];
			injectedComponents[baseClassName] = replacementClassName;
		}
	}
	return injectedComponents;
}

export default function InjectableComponentsEnhancer(ComposedComponent) {
	return class extends React.Component {
		constructor(props) {
			super(props);
			this.state = Object.assign({}, {
				components: Object.assign({}, components(), injectablesFromProps(props))
			}, this.state);
			
		}

		componentWillReceiveProps(nextProps) {
			this.setState({
				components: Object.assign({}, components(), injectablesFromProps(nextProps))
			});
		}

		render() {
			return <ComposedComponent {...this.props} {...this.state} />;
		}
	};
}