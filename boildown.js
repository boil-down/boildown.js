
var Boildown = (function() {
	'use strict';

	const INLINE = [
		["<br/>",           / \\\\(?: |$)/ ],
		["$1&mdash;$1",     /(^| )--($| )/g ],
		["&hellip;",        /\.\.\./g ], 
		["<code>$1</code>", /`([^`]+)`/g ],
		["<b>$1</b>",       /\*([^*]+)\*/g ],
		["<em>$1</em>",     /_([^_\/]+)_/g ],
		["<s>$1</s>",       /~([^~]+)~/g ],
		["<ins>$1</ins>",   /\+\+\+([^+].*?)\+\+\+/g ],
		["<del>$1</del>",   /---([^-].*?)---/g ],
		["&$1;",            /&amp;([a-zA-Z]{2,10});/g ], // unescape HTML entities
		["<a href=\"$1\">$2</a>", /\[\[((?:https?:\/\/)?(?:[-_a-zA-Z0-9]{0,15}[.:/#+]?){1,20}) (.+?)\]\]/g ],
		["<a href=\"#sec-$1\">$1</a>", /\[\[(\d+(?:\.\d+)*)\]\]/g ],
		["<sup><a href='#fnote$1'>$1</a></sup>", /\^\[(\d+)\]/g ],
	];

	const BLOCKS    = [
		[ bMinipage,  /^:::/ ],
		[ bParagraph, /^\+\+\+/ ], //TODO
		[ bParagraph, /^---(?:$|[^-])/ ], //TODO
		[ bListing,   /^```/ ],
		[ bQuote,     /^>>>/ ],
		[ bLine,      /^----/ ],
		[ bDescribe,  /^= / ],
		[ bExample,   /^\? / ],
		[ bNQuote,    /^> / ],
		[ bList,      /^\* / ],
		[ bList,      /^(#|[0-9]{1,2}|[a-zA-Z])\. / ],
		[ bHeading,   /^[=]{2,}(.+)[=]{2,}(\[.*\])?[ \t]*$/ ],
		[ bTable,     /^\|+(!?.+?|-+)\|(?:\[.*\])?$/ ],
		[ bParagraph, /^(.|$)/ ]
	];

	const OPTIONS = [
		// dynamic values
		[ /^(?: ?[a-zA-Z][-_a-zA-Z0-9]*)+$/ ], // length 1 => classes, else => style
		[ /^[0-9]{1,3}%$/, "width"],
		[ /^#[0-9A-Fa-f]{6}$/, "background-color"],
		[ /^[0-9]{1,2}pt$/, "font-size"],
		// fixed values
		[ /^`$/,  "font-family", "monospace", "ff-mono"],
		[ /^'$/,  "font-family", "sans-serif", "ff-sans"],
		[ /^"$/,  "font-family", "serif", "ff-serif"],
		[ /^\*$/, "font-weight", "bold"],
		[ /^_$/,  "font-style", "italic"],
		[ /^~$/,  "text-decoration", "line-through"],
		[ /^<>$/, "text-align", "center"],
		[ /^<$/,  "text-align", "left"],
		[ /^>$/,  "text-align", "right"],
		[ /^<=$/, "float", "left"],
		[ /^=>$/, "float", "right"],
		[ /^<<</, "clear", "both"],
		[ /^\\\\$/, "white-space", "pre-wrap"],
	];

	function Doc(markup) {
		this.markup = markup;		
		this.lines  = markup.split(/\r?\n/g);
		this.levels = [0,0,0,0,0,0,0];
		this.html   = "";
	}

	var _ = Doc.prototype; 
	_.line       = function (n) { return this.lines[n]; }
	_.deItem     = function (n) { var l = this.lines[n]; this.lines[n] = l.substring(l.indexOf(' ')); }
	_.unblock    = function (n, e, regex) { while (n < e && regex.test(this.lines[n])) { this.lines[n] = this.lines[n++].substring(2); } return n; }
	_.matches    = function (n, regex) { return regex.test(this.lines[n]); }
	_.add        = function (elem) { this.html+=elem; }
	_.process    = function (start, end, level) {
		var i = start;
		while (i < end) {
			var j = i;
			var block = first(BLOCKS, this.line(i), 1);
			i = block[0](this, i, end, level, block[1]);
			if (i == j) { console.log("endless loop at line: "+i); i++; } // inc to go on...
			j = i;
		}
	}

	return {
		toHTML: processMarkup
	};

	function processMarkup(markup) {
		var doc = new Doc(markup);
		doc.process(0, doc.lines.length, 2); // h2 is default start heading level
		return doc.html;
	}

	// BLOCK functions return the line index after the block

	function bLine(doc, start, end, level) {
		doc.add("<hr "+processOptions(doc.line(start))+" />\n");
		return start+1;
	}

	function bParagraph(doc, start, end, level) {
		var line = doc.line(start);
		if (isBlank(line)) {
			// TODO possible end of par
		} else {
			doc.add(processLine(line)+"\n");
		}
		return start+1;
	}

	function bHeading(doc, start, end, n, pattern) {
		if (n == 2 && doc.levels[1] === 0) { n = 1; }
		// TODO auto-subtitle
		doc.levels[n]++;
		var parts = pattern.exec(doc.line(start));
		doc.add("<h"+n+processOptions(parts[2])+">"+processLine(parts[1])+"</h"+n+">\t");
		return start+1;
	}

	function bNQuote(doc, start, end, level, pattern) {
		var i = doc.unblock(start, end, pattern);
		doc.add("<blockquote>\n"); 
		doc.process(start, i, level+1);
		doc.add("</blockquote>\n");
		return i;
	}

	function bQuote(doc, start, end, level, pattern) {
		var i = start+1;
		while (i < end && !pattern.test(doc.line(i))) { i++; }		
		doc.add("<blockquote "+processOptions(doc.line(start))+">\n"); 
		doc.process(start+1, i, level+1);
		doc.add("</blockquote>\n");
		return i+1;
	}

	function bDescribe(doc, start, end, level, pattern) {
		var i = doc.unblock(start, end, pattern);
		doc.add("<table class='describe'><tr><td><pre class='source'>");
		var l0 = doc.html.length;
		// following line must be done before processing the lines!
		var example = escapeHTML(doc.lines.slice(start, i).join("\n"));
		doc.process(start, i, level);
		var content = escapeHTML(doc.html.substring(l0));
		doc.html=doc.html.substring(0, l0);
		doc.add(example);
		doc.add("</pre></td><td>\n<pre class='source'>\n"); 
		doc.add(content);
		doc.add("</pre>\n</td></tr></table>");
		return i;
	}

	function bExample(doc, start, end, level, pattern) {
		var i = doc.unblock(start, end, pattern);
		doc.add("<table class='example'><tr><td><pre class='source'>");
		var l0 = doc.html.length;
		// following line must be done before processing the lines!
		var example = escapeHTML(doc.lines.slice(start, i).join("\n"));
		doc.process(start, i, level);
		var content = doc.html.substring(l0);
		doc.html=doc.html.substring(0, l0);
		doc.add(example);
		doc.add("</pre></td><td>\n"); 
		doc.add(content);
		doc.add("</td></tr></table>");
		return i;
	}

	function bListing(doc, start, end, level, pattern) {
		//TODO highlighting of keywords
		var i = start;
		var ci = 16;
		doc.add("<pre"+processOptions(doc.line(i++))+">\n");
		while (i < end && !pattern.test(doc.line(i))) { 
			var line = doc.line(i++);
			if (line.charAt(0) === '!')  {
				ci=Math.min(ci, line.substring(1).search(/[^ \t]/)+1); 
			} else {
				ci=Math.min(ci, line.search(/[^ \t]/)); 
			}
		}
		for (var j = start+1; j < i; j++) {
			var line = doc.line(j);
			var css = (ci > 0 && line.startsWith("!") ? "class='highlight'" : "");
			doc.add("<span "+css+">"+escapeHTML(line.substring(ci))+"</span>\n");
		}
		doc.add("</pre>\n");
		return i+1;
	}

	function bTable(doc, start, end, level, pattern) {
		var i = start;
		doc.add("<table class='user'>");
		var firstRow = true;
		while (i < end && pattern.test(doc.line(i))) { 
			var line = doc.line(i);
			if (i == start) { doc.add("<table "+processOptions(line.startsWith("|[") ? line : "", "user")+">"); }
			if (doc.matches(i, /\|\[ /)) {
				var side = i === start ? "top" : "bottom";
				var caption = line.substring(line.indexOf(" "), line.indexOf("]|"));
				if (!isBlank(caption)) {
					doc.add("<caption class='"+side+"'>"+processLine(caption)+"</caption>");
				}
			}
			if (doc.matches(i, /^\|[-=]/)) {
				if (!firstRow) { doc.add("</tr>"); }
				firstRow = false;
				var classes = line.indexOf('=') < 0 ? "" : "tborder";
				//TODO end table with border doesn't work as the tr is empty
				doc.add("<tr "+processOptions(doc.line(i), classes)+">");
			} else if (doc.matches(i, /\|+!? /)) {
				//TODO col and rowspan (needed as there is no fallback language!)
				if (firstRow) { doc.add("<tr>"); }
				firstRow = false;
				var line = doc.line(i);
				var tag = line.lastIndexOf("|!", 3) >= 0 ? "th" : "td";
				var eom = line.lastIndexOf("|");
				var som = line.lastIndexOf(" ", eom);
				var classes = (line.indexOf("||") === 0 ? " lborder" : "")+(line.indexOf("||", som) >= som ? " rborder" : "");
				doc.add("<"+tag+" "+processOptions(line.substring(eom), classes)+">");
				doc.add(processLine(line.substring(line.indexOf(" "), som)));
				doc.add("</"+tag+">");
			}
			i++;
		}
		doc.add("</tr></table>");
		return i;
	}

	function bList(doc, start, end, level, pattern) {
		var i = start;		
		var bullet = pattern.test("* ");
		var c = doc.line(i).charAt(0);
		doc.add( bullet ? "<ul>\n" : "<ol type='"+itemType(c)+"' start='"+itemStart(c)+"'>\n");
		var item = true;
		while (i < end && pattern.test(doc.line(i))) {
			var i0 = i;
			doc.deItem(i);
			i = doc.unblock(i+1, end, /^([ \t]{2}|\\s*$)/);
			doc.add("<li>\n\t");
			doc.process(i0, i, level);
			doc.add("</li>\n");
		}
		doc.add( bullet ? "</ul>\n" : "</ol>\n");
		return i;
	}

	function itemStart (c) { return c === '#' ? 1 : c.charCodeAt() - itemType(c).charCodeAt() + 1; } 
	function itemType  (c) { return /\d|#/.test(c) ? '1' : /i/i.test(c) ? c : /[A-Z]/.test(c) ? 'A' : 'a'; }

	function bMinipage(doc, start, end, level) {
		var line = doc.line(start);
		var depth = line.search(/[^:]/);
		var eop = new RegExp("^[:]{"+depth+"}($|[^:])");
		var i = start+1;
		while (i < end && !eop.test(doc.line(i))) { i++; }
		doc.add("<div"+processOptions(line, "bd-mp")+">\n\t");		
		doc.process(start+1, i, level+1); 
		doc.add("</div>\n");
		return i+1;
	}

	function processOptions(line, classes) {
		classes = classes ? classes : "";
		line = line ? line : "";
		var styles = "";
		var start = line.indexOf('[');
		while (start >= 0) {
			var end = line.indexOf(']', start);
			var val = line.substring(start+1, end);
			var option = processOption(val);
			if (option) {
				if (option.length === 1) {
					classes+=" "+val;
				} else {
					styles+=" "+option[1]+":"+(option.length > 2 ? option[2] : val)+";";
				}
				if (option.length > 3) {
					classes+=" "+option[3];
				}
			}
			start = line.indexOf('[', end);
		}
		return (classes ? "\n\tclass='"+classes+"'" : "") + (styles ? "\n\tstyle='"+styles+"'" : "");
	}

	function processOption(val) {
		return first(OPTIONS, val, 0);
		// option for preformatted text (linebreaks as in source)
		// option for floating?
		// margin: 0 auto; ( to center)
	}

	function processLine(line) {
		return processInline(escapeHTML(line));
	}

	function processInline(line) {
		var html = "";
		var start = 0;
		var end = line.indexOf("``", start);
		while (end >= 0)
		{
			if (end > start) { // add text up till literal section
				html+=inlineSubst(line.substring(start, end));
			}
			start=end+2;
			end=line.indexOf("``", start);
			html+="<code>"+line.substring(start, end)+"</code>";
			start=end+2;
			end=line.indexOf("``", start);
		}
		html+=inlineSubst(line.substring(start, line.length));
		return html;
	}

	function inlineSubst(line) {
		for (var i = 0; i < INLINE.length; i++) {
			line = line.replace(INLINE[i][1], INLINE[i][0]);
		}
		return inlineQuotes(line);
	}

	function inlineQuotes(line) {
		var res = line;		
		do {
			var len0 = res.length;
			res = res.replace(/([']{2,})(.+?)\1($|[^'])/g, "<q>$2</q>$3");
		} while (len0 !== res.length);
		return res;
	}

	function first(arr, val, idx) {
		for (var i = 0; i < arr.length; i++) {
			if (arr[i][idx].test(val))
				return arr[i]; 			
		}
	}

	function isBlank(str) {
		return (!str || /^\s*$/.test(str));
	}

	function escapeHTML(html) {
		var div = document.createElement('div');
		div.appendChild(document.createTextNode(html));
		return div.innerHTML;
	}
})();
