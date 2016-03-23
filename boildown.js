
var Boildown = (function() {
	'use strict';

	const INLINE = [
		["<br/>",           / \\\\(?: |$)/ ],
		["$1&mdash;$2",     /(^| )--($| )/g ],
		["&hellip;",        /\.\.\./g ], 
		["&$1;",            /&amp;([a-zA-Z]{2,10});/g ], // unescape HTML entities
		["<tt>$1</tt>",     /``(..*?)``/g ],
		["<s>$1</s>",       /~~(..*?)~~/g ],
		["<kbd>$1</kbd>",   /@@(..*?)@@/g ],
		["<del>$1</del>",   /--(..*?)--/g ],
		["<ins>$1</ins>",   /\+\+(..*?)\+\+/g ],
		["<q>$2</q>$3",     /([']{2,})(.*?[^'])\1($|[^'])/g, 5],
		["<sub>$2</sub>$3", /([_]{2,})(.*?[^_])\1($|[^_])/g, 5],
		["<sup>$2</sup>$3", /([\^]{2,})(.*?[^\^])\1($|[^\^])/g, 5 ],
		["<code>$1</code>", /`(..*?)`/g ],
		["<b>$1</b>",       /\*(..*?)\*/g ],
		["<em>$1</em>",     /_(..*?)_/g ],
		["<span style='color: $1$2;'>$3</span>", /#(?:#([a-z]{1,10})|(#[0-9A-Fa-f]{6}))#(..*?)##/g ],
		["<a href=\"$1\">$2</a>", /\[\[((?:https?:\/\/)?(?:[-_a-zA-Z0-9]{0,15}[.:/#+]?){1,20}) (.+?)\]\]/g ],
		["$1<a href=\"$2$3\">$3</a>", /(^|[^=">])(https?:\/\/|www\.)((?:[-_a-zA-Z0-9]{0,15}[.:/#+]?){1,20})/g ],
		["<a href=\"#sec-$1\">$1</a>", /\[\[(\d+(?:\.\d+)*)\]\]/g ],
		["<sup><a href='#fnote$1'>$1</a></sup>", /\^\[(\d+)\]/g ],
		//TODO samp/var/abbr/dfn
	];

	const BLOCKS    = [
		[ bMinipage,  /^(:{3,9})(?:\{([a-z0-9]{1,20})\})?/ ],
		[ bInserted,  /^\+\+\+/ ],
		[ bDeleted,   /^---(?:$|[^-])/ ],
		[ bListing,   /^```/ ],
		[ bQuote,     /^>>>/ ],
		[ bLine,      /^----/ ],
		[ bDescribe,  /^= / ],
		[ bExample,   /^\? / ],
		[ bNQuote,    /^> / ],
		[ bList,      /^\* / ],
		[ bList,      /^(#|[0-9]{1,2}|[a-zA-Z])\. / ],
		[ bHeading,   /^={3,}(.+?)={3,}(?:\{([a-z0-9]+)\})?(\[.*\])?[ \t]*$/ ],
		[ bTable,     /^\|+(!?.+?|-+)\|(?:\[.*\])?$/ ],
		[ bImage,     /^(?:\(\(((?:(?:https?:\/\/)?(?:[-_a-zA-Z0-9]{0,15}[.:/#+]?){1,20}))( [-+a-zA-Z0-9 ,.:]+)?\)\)|\(\[..*?\]\))(?:\[.*\])?$/ ],
		[ bParagraph, /^(.|$)/ ]
	];

	const STYLES = [
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

	const TAGS = ["address", "article", "aside", "details", "figcaption", 
		"figure", "footer", "header", "menu", "nav", "section"];

	function Doc(markup) {
		this.markup = markup;
		this.lines  = markup.split(/\r?\n/g);
		this.levels = [0,0,0,0,0,0,0];
		this.html   = "";
		// common functions
		this.process  = process;
		this.styles   = styles;
		this.scan     = scan;
		this.unindent = unindent;
	}

	var _ = Doc.prototype; 
	_.line       = function (n) { return this.lines[n]; }
	_.matches    = function (n, regex) { return regex.test(this.lines[n]); }
	_.add        = function (elem) { this.html+=elem; }

	return {
		toHTML: processMarkup
	};

	function processMarkup(markup) {
		var doc = new Doc(markup);
		doc.process(0, doc.lines.length, 2); // h2 is default start heading level
		return doc.html;
	}

	/* common functions on documents - must be called so this is the document */

	function process(start, end, level) {
		var i = start;
		while (i < end) {
			var before = i;
			var block = first(BLOCKS, this.lines[i], 1);
			i = block[0](this, i, end, level, block[1]);
			if (i === before) { 
				if (console && console.log) { console.log("endless loop at line "+i+": "+this.lines[i]); }
				i++; // error recovery: go on on next line
			} 
		}
	}

	function unindent(width, start, end, pattern) {
		var i = start;
		while (i < end && pattern.test(this.lines[i])) {
			this.lines[i] = this.lines[i].substring(Math.min(this.lines[i].length, width));
			i++;
		} 
		return i;
	}

	function scan(start, end, pattern) {
		var i = start;
		while (i < end && !pattern.test(this.lines[i])) { i++; }
		return i;
	}

	// BLOCK functions return the line index after the block

	function bLine(doc, start, end, level) {
		doc.add("<hr "+doc.styles(doc.line(start))+" />\n");
		return start+1;
	}

	function bParagraph(doc, start, end, level) {
		var line = doc.line(start);
		if (isBlank(line)) {
			doc.add("\n");
		} else {
			if (doc.html.endsWith("</p>")) {
				doc.html = doc.html.substring(0, doc.html.length-4);
			} else {
				doc.add("\n<p>");
			}
			doc.add(processLine(line)+"\n");
			doc.add("</p>");
		}
		return start+1;
	}

	function bHeading(doc, start, end, n, pattern) {
		if (n == 2 && doc.levels[1] === 0) { n = 1; }
		if (start > 0 && pattern.test(doc.line(start-1))) { n++; }
		doc.levels[n]++;
		var textIdStyle = pattern.exec(doc.line(start));
		if (textIdStyle[2]) {
			doc.add("<a id=\""+textIdStyle[2]+"\"></a>");
		}
		doc.add("<h"+n+" "+doc.styles(textIdStyle[3])+">"+processLine(textIdStyle[1])+"</h"+n+">\t");
		return start+1;
	}

	function bNQuote(doc, start, end, level, pattern) {
		var i = doc.unindent(2, start, end, pattern);
		doc.add("<blockquote>\n"); 
		doc.process(start, i, level+1);
		doc.add("</blockquote>\n");
		return i;
	}

	function bQuote(doc, start, end, level, pattern) {
		var i = doc.scan(start+1, end, pattern);
		doc.add("<blockquote "+doc.styles(doc.line(start))+">\n"); 
		doc.process(start+1, i, level+1);
		doc.add("</blockquote>\n");
		return i+1;
	}

	function bDeleted(doc, start, end, level, pattern) {
		var i = doc.scan(start+1, end, pattern);
		doc.add("<del "+doc.styles(doc.line(start))+">\n"); 
		doc.process(start+1, i, level);
		doc.add("</del>\n");		
		return i+1;
	}

	function bInserted(doc, start, end, level, pattern) {
		var i = doc.scan(start+1, end, pattern);
		doc.add("<ins "+doc.styles(doc.line(start))+">\n"); 
		doc.process(start+1, i, level);
		doc.add("</ins>\n");		
		return i+1;
	}

	function bDescribe(doc, start, end, level, pattern) {
		var i = doc.unindent(2, start, end, pattern);
		doc.add("<table class='describe'><tr><td><pre class='source'>");
		var l0 = doc.html.length;
		// following line must be done before processing the lines!
		var example = escapeHTML(doc.lines.slice(start, i).join("\n"));
		doc.process(start, i, level);
		var content = escapeHTML(doc.html.substring(l0));
		doc.html=doc.html.substring(0, l0);
		doc.add(example);
		doc.add("</pre></td><td>\n<pre class='source'>"); 
		doc.add(content);
		doc.add("</pre>\n</td></tr></table>");
		return i;
	}

	function bExample(doc, start, end, level, pattern) {
		var i = doc.unindent(2, start, end, pattern);
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
		doc.add("<pre"+doc.styles(doc.line(i++))+">\n");
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

	function bImage(doc, start, end, level, pattern) {
		var i = start;
		var images = [];
		var caption = "";
		var style = "";
		var first = false;
		while (i < end && pattern.test(doc.line(i))) {
			var line = doc.line(i);
			if (line.startsWith("((")) {
				images.push(pattern.exec(line));
			} else {
				first = i === start;
				caption = "<figcaption>"+processLine(line.substring(2, line.lastIndexOf("])")))+"</figcaption>";
				style = doc.styles(line.substring(line.lastIndexOf("])")+2));
			}
			i++;
		}
		if (images.length > 1 || caption) {
			doc.add("<figure "+style+">");
		}
		if (caption && first) { doc.add(caption); }
		for (var j = 0; j < images.length; j++) {
			var title = images[j][2];
			title = title ? "title='"+title+"' alt='"+title+"'" : "";
			doc.add("<img src=\""+images[j][1]+"\" "+doc.styles(images[j][0])+" "+title+" />");
		}
		if (caption && !first) { doc.add(caption); }
		if (images.length > 1 || caption) {
			doc.add("</figure>");			
		}
		return i;
	}

	function bTable(doc, start, end, level, pattern) {
		var i = start;
		doc.add("<table class='user'>");
		var firstRow = true;
		while (i < end && pattern.test(doc.line(i))) { 
			var line = doc.line(i);
			if (i == start) { doc.add("<table "+doc.styles(line.startsWith("|[") ? line : "", "user")+">"); }
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
				doc.add("<tr "+doc.styles(doc.line(i), classes)+">");
			} else if (doc.matches(i, /\|+!? /)) {
				//TODO col and rowspan (needed as there is no fallback language!)
				if (firstRow) { doc.add("<tr>"); }
				firstRow = false;
				var line = doc.line(i);
				var tag = line.lastIndexOf("|!", 3) >= 0 ? "th" : "td";
				var eom = line.lastIndexOf("|");
				var som = line.lastIndexOf(" ", eom);
				var classes = (line.indexOf("||") === 0 ? " lborder" : "")+(line.indexOf("||", som) >= som ? " rborder" : "");
				doc.add("<"+tag+" "+doc.styles(line.substring(eom), classes)+">");
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
			doc.lines[i] = doc.lines[i].substring(doc.lines[i].indexOf(' '));
			i = doc.unindent(2, i+1, end, /^(?:(?:[ \t]{2})|\s*$)/);
			doc.add("<li>\n\t");
			doc.process(i0, i, level);
			doc.add("</li>\n");
		}
		doc.add( bullet ? "</ul>\n" : "</ol>\n");
		return i;
	}

	function itemStart (c) { return c === '#' ? 1 : c.charCodeAt() - itemType(c).charCodeAt() + 1; } 
	function itemType  (c) { return /\d|#/.test(c) ? '1' : /i/i.test(c) ? c : /[A-Z]/.test(c) ? 'A' : 'a'; }

	function bMinipage(doc, start, end, level, pattern) {
		var line = doc.line(start);
		var page = pattern.exec(line);
		var i = doc.scan(start+1, end, new RegExp("^"+page[1]+"($|[^:])"));
		var tagged = page.length > 2 && page[2];
		var retag = tagged && TAGS.indexOf(page[2]) >= 0;
		var tag = retag? page[2] : "div";
		var classes = "bd-mp "+(tagged && !retag ? page[2] : "");
		doc.add("<"+tag+" "+doc.styles(line, classes)+">\n\t");
		doc.process(start+1, i, level+1); 
		doc.add("</"+tag+">\n");
		return i+1;
	}

	function styles(line, classes) {
		classes = classes ? classes : "";
		line = line ? line : "";
		var styles = "";
		var start = line.indexOf('[');
		while (start >= 0) {
			var end = line.indexOf(']', start);
			var val = line.substring(start+1, end);
			var style = first(STYLES, val, 0);
			if (style) {
				switch (style.length) {
					case 1:	classes+=" "+val; break;
					case 4: classes+=" "+style[3]; /* intentianal fall-through */
					case 3: val = style[2]; /* intentianal fall-through */
					case 2: styles+=" "+style[1]+":"+val+";";
				}
			}
			start = line.indexOf('[', end);
		}
		return (classes ? "\n\tclass='"+classes+"'" : "") + (styles ? "\n\tstyle='"+styles+"'" : "");
	}

	function processLine(line) {
		return processInline(escapeHTML(line));
	}

	function processInline(line) {
		var plains = [];		
		var stripped = "";
		var start = 0;
		var end = line.indexOf("{{", start);
		while (end >= 0)
		{
			if (end > start) { // add text up till literal section
				stripped+=line.substring(start, end);
			}
			start=end+2;
			end=line.indexOf("}}", start);
			stripped+="!!"+plains.length+"!!";			
			plains.push(line.substring(start, end));
			start=end+2;
			end=line.indexOf("{{", start);
		}
		stripped+=line.substring(start, line.length);
		var html = substitute(stripped);
		for (var i = 0; i < plains.length; i++) {
			html=html.replace("!!"+i+"!!", plains[i]);
		}
		return html;
	}

	function substitute(line) {
		for (var i = 0; i < INLINE.length; i++) {
			var lmax = INLINE[i].length > 2 ? INLINE[i][2] : 1;			
			do {			
				var before = line.length;
				line = line.replace(INLINE[i][1], INLINE[i][0]);
			} while (--lmax > 0 && before !== line.length);
		}
		return line;
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
