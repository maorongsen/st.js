(function () {
	var $context = this;
	//指令类型
	var DirectiveType = {
		BASIC: 1,
		LOOP: 2,
		CONDITIONAL: 3, //
		EXISTENTIAL: 4, //存在判断
		CONCAT: 5,
		MERGE: 6,
		LOCAL: 7 //局部变量 #lent
	};
	//语法分析节点
	function ASNode(isStatic, directiveType, directive, renderFuncStr) {
		this.isStatic = isStatic; //静态内容，不包含{{}}
		this.directiveType = directiveType; //指令类型
		this.directive = directive; //指令#let
		if(renderFuncStr){
			console.log(renderFuncStr);
		}
		this.renderFunc = Function(renderFuncStr); //渲染函数
		this.render = function (data) {
			return this.renderFunc.bind(data)();
		}
	}

	function createRenderFuncStr(str) {
		var re = /\{\{(.*?)\}\}/g;
		var full_re = /^\{\{((?!\}\}).)*\}\}$/;
		var variables = str.match(re);
		if (full_re.test(str)) {
			var slot = variables[0].replace(re, '$1');
			var funcStr = 'with(this){ return (' + slot + ');}';
			return funcStr;
		}
		var funcStr = 'with(this){ var t="' + str + '";';
		for (var i = 0; i < variables.length; i++) {
			var variable = variables[i];
			var slot = variable.replace(re, '$1');
			if (i === 0) {
				funcStr += 'var v="' + variable + '";';
				funcStr += 'var s=' + slot + ';';
			} else {
				funcStr += 'v="' + variable + '";';
				funcStr += 's=' + slot + ';';
			}
			funcStr += 't = t.replace(v,s);'
		}
		funcStr += 'return t;}'
		return funcStr;
	}
	var Helper = {
		testCache: {},
		is_template: function (str) {
			var ret = Helper.testCache[str];
			if (ret != undefined) {
				return ret;
			}
			var re = /\{\{(.+)\}\}/g;
			ret = re.test(str);
			Helper.testCache[str] = ret;
			return ret;
		},
		is_array: function (item) {
			return (
				Array.isArray(item) ||
				(!!item &&
					typeof item === 'object' && typeof item.length === 'number' &&
					(item.length === 0 || (item.length > 0 && (item.length - 1) in item))
				)
			);
		},
	};
	var Conditional = {
		//执行判断逻辑，模板必须是数组。
		run: function (template, data) {
			// expecting template as an array of objects,
			// each of which contains '#if', '#elseif', 'else' as key

			// item should be in the format of:
			// {'#if item': 'blahblah'}

			// Step 1. get all the conditional keys of the template first.
			// Step 2. then try evaluating one by one until something returns true
			// Step 3. if it reaches the end, the last item shall be returned
			for (var i = 0; i < template.length; i++) {
				var item = template[i];
				var keys = Object.keys(item);
				// assuming that there's only a single kv pair for each item
				var key = keys[0];
				var keyNode = TRANSFORM.parse(key);
				if (keyNode.directive === '#if' || keyNode.directive === '#elseif') {
					var res = keyNode.render(data);
					if (res) {
						return TRANSFORM.run(item[key], data);
					} else {

					}
				} else {
					// #else
					// if you reached this point, it means:
					//  1. there were no non-evaluatable expressions
					//  2. Yet all preceding expressions evaluated to falsy value
					//  Therefore we run this branch
					return TRANSFORM.run(item[key], data);
				}
			}
			// if you've reached this point, it means nothing matched.
			// so return null
			return null;
		},
		//语法检查，校验是否正确的判断表达式
		is: function (template) {
			// TRUE ONLY IF it's in a correct format.
			// Otherwise return the original template
			// Condition 0. Must be an array
			// Condition 1. Must have at least one item
			// Condition 2. Each item in the array should be an object of a single key/value pair
			// Condition 3. starts with #if
			// Condition 4. in case there's more than two items, everything between the first and the last item should be #elseif
			// Condition 5. in case there's more than two items, the last one should be either '#else' or '#elseif'
			if (!Helper.is_array(template)) {
				// Condition 0, it needs to be an array to be a conditional
				return false;
			}
			// Condition 1.
			// Must have at least one item
			if (template.length === 0) {
				return false;
			}
			// Condition 2.
			// Each item in the array should be an object
			// , and  of a single key/value pair
			var containsValidObjects = true;
			for (var i = 0; i < template.length; i++) {
				var item = template[0];
				if (typeof item !== 'object') {
					containsValidObjects = false;
					break;
				}
				if (Object.keys(item).length !== 1) {
					// first item in the array has multiple key value pairs, so invalid.
					containsValidObjects = false;
					break;
				}
			}
			if (!containsValidObjects) {
				return false;
			}
			// Condition 3.
			// the first item should have #if as its key
			// the first item should also contain an expression
			var first = template[0];
			var firstKey = Object.keys(first)[0];
			var keyNode = TRANSFORM.parse(firstKey);
			if (keyNode.directive === '#if'){
				return true;
			}
			return false;
		},
	};
	var count = 0;
	var TRANSFORM = {
		memory: {},

		//编译模板

		compileTemplate: function (obj) {
			var t = {};
			t.dt = null;
			t.d = null;
			t.renderFunc = null;
			t.isTemplate = false;

			return t;
		},
		//分离动静模板
		separate: function (template, forceKeep) {
			if (Helper.is_array(template)) {
				//数组
				var d = [];
				var k = Conditional.is(template); //是判断语句，那么就算value无内容也要保留空对象
				for (var i = 0; i < template.length; i++) {
					var ret = TRANSFORM.separate(template[i], k);
					if (ret) {
						d.push(ret);
					}
				}
				if (d.length) {
					return d;
				}
			} else {
				//对象
				var d = {};
				for (var key in template) {
					//如果key是
					var value = template[key];
					if (Helper.is_template(key)) {
						if (typeof value === 'string') {
							d[key] = value;
						} else {
							var ret = TRANSFORM.separate(value);
							if (ret) {
								d[key] = ret;
							} else if (forceKeep) {
								if (Helper.is_array(value)) {
									d[key] = [];
								} else {
									d[key] = {};
								}
							}
						}
					} else {
						if (typeof value === 'string') {
							if (Helper.is_template(value)) {
								d[key] = value;
							}
						} else {
							var ret = TRANSFORM.separate(value);
							if (ret) {
								d[key] = ret;
							}
						}
					}
				}
				if (Object.keys(d).length) {
					return d;
				}
			}
			return null;
		},
		fastTransform: function (template, data) {
			var dt = TRANSFORM.separate(template);
			TRANSFORM.transform(dt, data);
		},
		transform: function (template, data, injection, serialized) {
			var data = data;
			try {
				if (serialized) data = JSON.parse(data);
			} catch (error) {}
			String.prototype.$root = data;
			Number.prototype.$root = data;
			Function.prototype.$root = data;
			Array.prototype.$root = data;
			Boolean.prototype.$root = data;
			var res = TRANSFORM.run(template, data);
			delete String.prototype.$root;
			delete Number.prototype.$root;
			delete Function.prototype.$root;
			delete Array.prototype.$root;
			delete Boolean.prototype.$root;
			if (serialized) {
				// needs to return stringified version
				return JSON.stringify(res);
			} else {
				return res;
			}
		},
		//缓存token信息
		tokenizeCache: {},
		//区分指令和表达式，不然返回null，传进来只能是{{}}基本slot
		asNodeCache: {},
		parse: function (str) {
			var node = TRANSFORM.asNodeCache[str];
			if (node) {
				return node;
			}
			var originalStr = str;
			str = str.trim();
			if (Helper.is_template(str)) {
				//判断是否指令
				if (str.indexOf('{{#') !== -1) {
					var re = /\{\{(.+)\}\}/g;
					str = str.replace(re, '$1');
					var tokens = str.split(' ');
					var directive = tokens.shift();
					var expression = tokens.join(' ');
					var funcStr = 'with(this){ return (' + expression + ');}';
					var directiveType;
					if (directive === '#if' || directive === '#ifelse', directive === '#else') {
						directiveType = DirectiveType.CONDITIONAL;
					} else if (directive === '#each') {
						directiveType = DirectiveType.LOOP;
					} else if (directive === '#let') {
						directiveType = DirectiveType.LOCAL;
					} else if (directive === '#concat') {
						directiveType = DirectiveType.CONCAT;
					} else if (directive === '#merge') {
						directiveType = DirectiveType.MERGE;
					} else if (directive === '#?') {
						directiveType = DirectiveType.EXISTENTIAL;
					}
					node = new ASNode(false, directiveType, directive, funcStr);
				} else {
					//普通模板
					var funcStr = createRenderFuncStr(str);
					node = new ASNode(false, null, null, funcStr);
				}
			} else {
				node = new ASNode(true);
			}
			TRANSFORM.asNodeCache[originalStr] = node;
			return node;
		},
		run: function (template, data) {
			var result;
			var fun;
			//只是一个value节点
			if (typeof template === 'string') {
				// Leaf node, so call TRANSFORM.fillout()
				var node = TRANSFORM.parse(template);
				if (node.isStatic) {
					result = template;
				} else {
					result = node.render(data);
				}
			} else if (Helper.is_array(template)) {
				//如果是一个数组，那么要看看是否是一个条件表达式
				if (Conditional.is(template)) {
					result = Conditional.run(template, data);
				} else {
					result = [];
					for (var i = 0; i < template.length; i++) {
						var item = TRANSFORM.run(template[i], data);
						if (item) {
							// only push when the result is not null
							// null could mean #if clauses where nothing matched => In this case instead of rendering 'null', should just skip it completely
							// Todo : Distinguish between #if arrays and ordinary arrays, and return null for ordinary arrays
							result.push(item);
						}
					}
				}
			} else if (Object.prototype.toString.call(template) === '[object Object]') { //精确判断是否Object
				// template is an object
				result = {};

				for (var key in template) {
					// Checking to see if the key contains template..
					// Currently the only case for this are '#each' and '#include'
					var keyNode = TRANSFORM.parse(key);
					var val = template[key];
					if (!keyNode.isStatic) {
						//如果有指令
						if (keyNode.directiveType) {
							if (keyNode.directive === '#let') {
								if (Helper.is_array(val) && val.length == 2) {
									var defs = val[0];
									var real_template = val[1];

									// 1. Parse the first item to assign variables
									var parsed_keys = TRANSFORM.run(defs, data);

									// 2. modify the data
									for (var parsed_key in parsed_keys) {
										TRANSFORM.memory[parsed_key] = parsed_keys[parsed_key];
										data[parsed_key] = parsed_keys[parsed_key];
									}

									// 2. Pass it into TRANSFORM.run
									result = TRANSFORM.run(real_template, data);
								}
							} else if (keyNode.directive === '#concat') {
								if (Helper.is_array(val)) {
									result = [];
									val.forEach(function (concat_item) {
										var res = TRANSFORM.run(concat_item, data);
										result = result.concat(res);
									});

									if (/\{\{(.*?)\}\}/.test(JSON.stringify(result))) {
										// concat should only trigger if all of its children
										// have successfully parsed.
										// so check for any template expression in the end result
										// and if there is one, revert to the original template
										result = template;
									}
								}
							} else if (keyNode.directive === '#merge') {
								if (Helper.is_array(val)) {
									result = {};
									val.forEach(function (merge_item) {
										var res = TRANSFORM.run(merge_item, data);
										for (var key in res) {
											result[key] = res[key];
										}
									});
									// clean up $index from the result
									// necessary because #merge merges multiple objects into one,
									// and one of them may be 'this', in which case the $index attribute
									// will have snuck into the final result
									if (typeof data === 'object') {
										delete result["$index"];

										// #let handling
										for (var declared_vars in TRANSFORM.memory) {
											delete result[declared_vars];
										}
									} else {
										delete String.prototype.$index;
										delete Number.prototype.$index;
										delete Function.prototype.$index;
										delete Array.prototype.$index;
										delete Boolean.prototype.$index;

										// #let handling
										for (var declared_vars in TRANSFORM.memory) {
											delete String.prototype[declared_vars];
											delete Number.prototype[declared_vars];
											delete Function.prototype[declared_vars];
											delete Array.prototype[declared_vars];
											delete Boolean.prototype[declared_vars];
										}
									}
								}
							} else if (keyNode.directive === '#each') {
								// newData will be filled with parsed results
								var newData = keyNode.render(data);

								// Ideally newData should be an array since it was prefixed by #each
								if (newData && Helper.is_array(newData)) {
									result = [];
									for (var index = 0; index < newData.length; index++) {
										// temporarily set $index
										if (typeof newData[index] === 'object') {
											newData[index]["$index"] = index;
											// #let handling
											for (var declared_vars in TRANSFORM.memory) {
												newData[index][declared_vars] = TRANSFORM.memory[declared_vars];
											}
										} else {
											String.prototype.$index = index;
											Number.prototype.$index = index;
											Function.prototype.$index = index;
											Array.prototype.$index = index;
											Boolean.prototype.$index = index;
											// #let handling
											for (var declared_vars in TRANSFORM.memory) {
												String.prototype[declared_vars] = TRANSFORM.memory[declared_vars];
												Number.prototype[declared_vars] = TRANSFORM.memory[declared_vars];
												Function.prototype[declared_vars] = TRANSFORM.memory[declared_vars];
												Array.prototype[declared_vars] = TRANSFORM.memory[declared_vars];
												Boolean.prototype[declared_vars] = TRANSFORM.memory[declared_vars];
											}
										}

										// run
										var loop_item = TRANSFORM.run(val, newData[index]);

										// clean up $index
										if (typeof newData[index] === 'object') {
											delete newData[index]["$index"];
											// #let handling
											for (var declared_vars in TRANSFORM.memory) {
												delete newData[index][declared_vars];
											}
										} else {
											delete String.prototype.$index;
											delete Number.prototype.$index;
											delete Function.prototype.$index;
											delete Array.prototype.$index;
											delete Boolean.prototype.$index;
											// #let handling
											for (var declared_vars in TRANSFORM.memory) {
												delete String.prototype[declared_vars];
												delete Number.prototype[declared_vars];
												delete Function.prototype[declared_vars];
												delete Array.prototype[declared_vars];
												delete Boolean.prototype[declared_vars];
											}
										}

										if (loop_item) {
											// only push when the result is not null
											// null could mean #if clauses where nothing matched => In this case instead of rendering 'null', should just skip it completely
											result.push(loop_item);
										}
									}
								} else {
									// In case it's not an array, it's an exception, since it was prefixed by #each.
									// This probably means this #each is not for the current variable
									// For example {{#each items}} may not be an array, but just leave it be, so
									// But don't get rid of it,
									// Instead, just leave it as template
									// So some other parse run could fill it in later.
									result = template;
								}
							} // end of #each
						} else { // end of if (fun)
							// If the key is a template expression but aren't either #include or #each,
							// it needs to be parsed
							//没有指令，直接填充模板
							var k = keyNode.render(data);
							var valNode = TRANSFORM.parse(val);
							if (k !== undefined) {
								if (valNode.isStatic) {
									result[k] = val;
								} else {
									var v = val.render(data);
									if (v !== undefined) {
										result[k] = v;
									}
								}
							}
						}
					} else {
						var val = template[key];
						if (typeof val === 'string') {
							var valNode = TRANSFORM.parse(val);
							if (valNode.isStatic) {
								result[key] = val;
							} else {
								if (valNode.directiveType === DirectiveType.EXISTENTIAL) {
									var filled = valNode.render(data);
									if (filled) {
										result[key] = filled;
									}
								} else {
									var item = valNode.render(data);
									if (item !== undefined) {
										result[key] = item;
									}
								}
							}
						} else {
							var item = TRANSFORM.run(val, data);
							if (item !== undefined) {
								result[key] = item;
							}
						}
					}
				}
			} else {
				return template;
			}
			return result;
		},
		createRenderFunc: function (template) {
			if (Helper.is_template(template)) {
				var re = /\{\{(.*?)\}\}/g;
				var full_re = /^\{\{((?!\}\}).)*\}\}$/;
				// slots are all instances of {{ }} in the current expression
				// for example '{{this.item}} is {{this.user}}'s' has two slots: ['this.item', 'this.user']
				var variables = template.match(re);
				if (variables) {
					if (full_re.test(template)) {
						var slot = variables[0].replace(re, '$1');
						var funcStr = 'with(this){ return (' + slot + ');}';
						return Function(funcStr);
					}
					var funcStr = 'with(this){ var t="' + template + '";';
					for (var i = 0; i < variables.length; i++) {
						var variable = variables[i];
						var slot = variable.replace(re, '$1');
						if (i === 0) {
							funcStr += 'var v="' + variable + '";';
							funcStr += 'var s=' + slot + ';';
						} else {
							funcStr += 'v="' + variable + '";';
							funcStr += 's=' + slot + ';';
						}
						funcStr += 't = t.replace(v,s);'
					}
					funcStr += 'return t;}'
					console.log(funcStr);
					return Function(funcStr);
				} else {
					return null;
				}
			}
			return null;
		}
	};

	// Native JSON object override
	var _stringify = JSON.stringify;
	JSON.stringify = function (val, replacer, spaces) {
		var t = typeof val;
		if (['number', 'string', 'boolean'].indexOf(t) !== -1) {
			return _stringify(val, replacer, spaces);
		}
		if (!replacer) {
			return _stringify(val, function (key, val) {
				if (key === '$root' || key === '$index') {
					return undefined;
				}
				if (key in TRANSFORM.memory) {
					return undefined;
				}
				if (typeof val === 'function') {
					return '(' + val.toString() + ')';
				} else {
					return val;
				}
			}, spaces);
		} else {
			return _stringify(val, replacer, spaces);
		}
	};

	// Export
	if (typeof exports !== 'undefined') {
		var x = {
			TRANSFORM: TRANSFORM,
			transform: TRANSFORM,
			Conditional: Conditional,
			Helper: Helper,
			transform: TRANSFORM.transform,
			fastTransform: TRANSFORM.fastTransform,
		};
		if (typeof module !== 'undefined' && module.exports) {
			exports = module.exports = x;
		}
		exports = x;
	} else {
		$context.ST = {
			transform: TRANSFORM.transform,
			fastTransform: TRANSFORM.fastTransform,
		};
	}

	
	//测试basice
	console.log("测试Basic")
	var template = {
		"menu": {
			"flavor": "1",
			"richness": "2",
			"garlic amount": "3",
			"green onion?": "{{green_onion}}",
			"sliced pork?": "{{pork_amount}}",
			"secret sauce": "{{sauce_amount}}",
			"noodle's texture": "{{texture}}"
		}
	}

	var data = {
		"flavor": "strong",
		"richness": "ultra rich",
		"garlic_amount": "1 clove",
		"green_onion": "thin green onion",
		"pork_amount": "with",
		"sauce_amount": "double",
		"texture": "extra firm"
	}
	var result = TRANSFORM.transform(template, data)
	console.log(result)

	console.log("测试Loop")
	template = {
		"orders": {
			"{{#each customers}}": {
				"order": "One {{menu}} for {{name}}!",
				"name": "Good name!!!"
			}
		}
	}

	data = {
		"customers": [{
			"name": "Hatter",
			"menu": "miso ramen"
		}, {
			"name": "March Hare",
			"menu": "tonkotsu ramen"
		}, {
			"name": "Dormouse",
			"menu": "miso ramen"
		}, {
			"name": "Alice",
			"menu": "cup noodles"
		}]
	}
	result = TRANSFORM.transform(template, data)
	console.log(result)

	console.log("测试Conditional")

	template = {
		"response": [{
			"{{#if spicy < 7}}": {
				"message": "Coming right up!"
			}
		}, {
			"{{#elseif spicy < 9}}": {
				"message": "Are you sure? It is very spicy"
			}
		}, {
			"{{#else}}": {
				"message": "Please sign here where it says you're responsible for this decision"
			}
		}]
	}

	data = {
		"spicy": 8
	}
	result = TRANSFORM.transform(template, data)
	console.log(result)

	console.log("测试Existential Operator")


	data = {
		notifications: {
			home: 1,
			invite: 2
		}
	};
	template = {
		tabs: [{
			text: "home",
			badge: "{{#? notifications.home}}"
		}, {
			text: "message",
			badge: "{{#? notifications.message}}"
		}, {
			text: "invite",
			badge: "{{#? notifications.invite}}"
		}]
	}
	result = TRANSFORM.transform(template, data)
	console.log(result)
	


}());