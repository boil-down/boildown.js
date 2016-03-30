
var Boildown = (function() {
	'use strict';

	const BLOCKS    = [
		[ Separator,        /^(?:(?:\s+[-+*]+){3,}|\s+[-+*]{3,})\s*(?:\[[^\]]+\])*$/ ],
		[ b3("ins"),        /^\+{3,}/ ],
		[ b3("del"),        /^-{3,}/ ],
		[ b3("blockquote"), /^>{3,}/ ],
		[ b2("blockquote"), /^> / ],
		[ Minipage,         /^(\*{3,})(?:\{(\w+)\})?/ ],
		[ Listing,          /^`{3,}\*?(?:\{(\w+(?: \w+)*)\})?/ ],
		[ Listing,          /^~{3,}\*?(?:\{(\w+(?: \w+)*)\})?/ ],
		[ Output,           /^= / ],
		[ Sample,           /^\? / ],
		[ List,             /^\* / ],
		[ List,             /^(#|[0-9]{1,2}|[a-zA-Z])\. / ],
		[ Heading,          /^={3,}(.+?)(?:={3,})(?:\{(\w+)\})?(\[.*\])?[ \t]*$/ ],
		[ Table,            /^\|+(!?.+?|-+)\|(?:\[.*\])?$/ ],
		[ Figure,           /^(?:\(\(((?:(?:https?:\/\/)?(?:[-_a-zA-Z0-9]{0,15}[.:/#+]?){1,20}))( [-+a-zA-Z0-9 ,.:]+)?\)\)|\(\[..*?\]\))(?:\[.*\])?$/ ],
		[ Paragraph,        /^(.|$)/ ]
	];

	const INLINE = [
		["<br/>",               / \\\\(?: |$)/g ],
		["$1<wbr>$2",           /(\w)\\-(\w)/g ],
		["$1&mdash;$2",         /(^| )-{3}($| )/g ],
		["$1&ndash;$2",         /(^| )--($| )/g ],
		["&hellip;",            /\.\.\./g ], 
		["&$1;",                /&amp;(\w{2,16});/g ], // unescape HTML entities
		["<q>$2</q>$3",         /([']{1,})(.*?[^'])\1($|[^'])/g, 5],
		["<sub>$2</sub>$3",     /([~]{1,})(.*?[^~])\1($|[^~])/g, 5],
		["<sup>$2</sup>$3",     /([\^]{1,})(.*?[^\^])\1($|[^\^])/g, 5 ],
		["<del>$1</del>",       /--(..*?)--/g ],
		["<ins>$1</ins>",       /\+\+(..*?)\+\+/g ],
		["<u class='$2'>$1</u>", /!(..*?)!\{([a-z]+)\}/g ],
		["<tt>$1</tt>",         /``(..*?)``/g ],
		["<span style='font-variant:small-caps;'>$1</span>", /==(..*?)==/g ],
		["<span style='text-decoration: underline;'>$1</span>", /__(..*?)__/g ],
		["<kbd>$1</kbd>",       /@(..*?)@/g ],
		["<code>$1</code>",     /`(..*?)`/g ],
		["<samp>$1</samp>",     /\$(..*?)\$/g ],
		["<abbr>$1</abbr>",     /\.([A-Z]{2,6})\./g ],
		["<cite>$1</cite>",     /"(..*?)"/g ],
		["<strong>$1</strong>", /\*(..*?)\*/g ],
		["<em>$1</em>",         /_(..*?)_/g ],
		[" <i>$1</i> ",         / \/([^\/ \t].*?[^\/ \t])\/ /g ],
		[" <s>$1</s> ",         / -([^- \t].*?[^- \t])- /g ],
		[" <def>$1</def> ",     / :([^: \t].*?[^: \t]): /g ],		
		["<span style='color: $2$3;'>$1</span>", /::([^:].*?)::\{(?:(\w{1,10})|(#[0-9A-Fa-f]{6}))\}/g ],
		["<a href=\"$1\">$2</a>", /\[\[((?:https?:\/\/)?(?:[-_a-zA-Z0-9]{0,15}[.:/#+]?){1,20}) (.+?)\]\]/g ],
		["$1<a href=\"$2$3\">$3</a>", /(^|[^=">])(https?:\/\/|www\.)((?:[-_a-zA-Z0-9]{0,15}[.:/#+]?){1,20})/g ],
		["<a href=\"#sec-$1\">$1</a>", /\[\[(\d+(?:\.\d+)*)\]\]/g ],
		["<sup><a href='#fnote$1'>$1</a></sup>", /\^\[(\d+)\]/g ],
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
		[ /^<<>>$/, "text-align", "justified"],
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
		this.minIndent= minIndent;
		this.line     = function (n) { return this.lines[n]; }
		this.add      = function (html) { this.html+=html; }
	}

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

	function minIndent(start, end, offset) {
		var res = 16;
		for (var i = start; i < end; i++) {
			res=Math.min(res, this.lines[i].substring(offset).search(/[^ \t]/)+offset); 
		}
		return res;
	}

	// BLOCK functions return the line index after the block

	function Separator(doc, start, end, level) {
		doc.add("<hr "+doc.styles(doc.line(start))+" />\n");
		return start+1;
	}

	function Paragraph(doc, start, end, level) {
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

	function Heading(doc, start, end, n, pattern) {
		if (n == 2 && doc.levels[1] === 0) { n = 1; }
		if (start > 0 && pattern.test(doc.line(start-1))) { n++; }
		doc.levels[n]++;
		var textIdStyle = pattern.exec(doc.line(start));
		var id = textIdStyle[2] ? textIdStyle[2] : text2id(textIdStyle[1]);
		doc.add("\n<a id=\""+id+"\"></a>");
		doc.add("<a id=\"sec"+doc.levels.slice(1, n+1).join('.')+"\"></a>");
		doc.add("\n<h"+n+" "+doc.styles(textIdStyle[3])+">"+processLine(textIdStyle[1])+"</h"+n+">\t");
		return start+1;
	}

	function text2id(text) {
		return text.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
	}

	function b2(tag) {
		function block(doc, start, end, level, pattern) {
			var i = doc.unindent(2, start, end, pattern);
			doc.add("<"+tag+">\n"); 
			doc.process(start, i, level+1);
			doc.add("</"+tag+">\n");
			return i;
		}
		return block;
	}

	function b3(tag) {
		function block(doc, start, end, level, pattern) {
			var i = doc.scan(start+1, end, pattern);
			doc.add("<"+tag+" "+doc.styles(doc.line(start))+">\n"); 
			doc.process(start+1, i, level+1);
			doc.add("</"+tag+">\n");
			return i+1;
		}
		return block;
	}

	function Output(doc, start, end, level, pattern) {
		var i = doc.unindent(2, start, end, pattern);
		doc.add("<table class='describe'><tr><td><pre class='source'><code>");
		var l0 = doc.html.length;
		// following line must be done before processing the lines!
		var example = escapeHTML(doc.lines.slice(start, i).join("\n"));
		doc.process(start, i, level);
		var content = escapeHTML(doc.html.substring(l0));
		doc.html=doc.html.substring(0, l0);
		doc.add(example);
		doc.add("</code></pre></td><td>\n<pre class='output'><samp>"); 
		doc.add(content);
		doc.add("</samp></pre>\n</td></tr></table>");
		return i;
	}

	function Sample(doc, start, end, level, pattern) {
		var i = doc.unindent(2, start, end, pattern);
		doc.add("<table class='example'><tr><td><pre class='source'><code>");
		var l0 = doc.html.length;
		// following line must be done before processing the lines!
		var example = escapeHTML(doc.lines.slice(start, i).join("\n"));
		example = example.replace(/ /g, "<span>&blank;</span>");
		doc.process(start, i, level);
		var content = doc.html.substring(l0);
		doc.html=doc.html.substring(0, l0);
		doc.add(example);
		doc.add("</code></pre></td><td>\n"); 
		doc.add(content);
		doc.add("</td></tr></table>");
		return i;
	}

	function Listing(doc, start, end, level, pattern) {
		var mark = doc.line(start);
		var keywords = pattern.exec(mark)[1]
		if (keywords) { keywords = keywords.split(" "); }
		var highlight=mark.indexOf('*') == 3;
		var tag = mark.indexOf('`') === 0 ? "code" : "samp"; 
		doc.add("<pre"+doc.styles(mark, tag)+"><"+tag+">");
		var i = doc.scan(start+1, end, pattern);
		var minIndent = doc.minIndent(start, end, highlight ? 1 : 0);	
		for (var j = start+1; j < i; j++) {
			var line = doc.line(j);
			var dline = escapeHTML(line.substring(minIndent));
			if (highlight) {
				if (" \t!".indexOf(line.charAt(0)) < 0) {
					var p = line.charAt(0)+"(..*?)"+line.charAt(0);
					dline = dline.replace(new RegExp(p, "g"), "<mark>$1</mark>");
				} else if (line.startsWith("!")) {
					dline = "<mark>"+dline+"</mark>";
				}
			}
			if (keywords) {
				for (var k = 0; k < keywords.length; k++) {
					dline = dline.replace(new RegExp("\\b("+keywords[k]+")\\b", "g"), "<b>$1</b>");
				}
			}
			doc.add("<span>"+dline+"\n</span>");
		}
		doc.add("</"+tag+"></pre>\n");
		return i+1;
	}

	function Figure(doc, start, end, level, pattern) {
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

	function Table(doc, start, end, level, pattern) {
		//TODO use * for headings (not !) 
		//TODO use a more consistent caption syntax?
		var i = start;
		doc.add("<table class='user'>");
		var firstRow = true;
		while (i < end && pattern.test(doc.line(i))) { 
			var line = doc.line(i);
			if (i == start) { doc.add("<table "+doc.styles(line.startsWith("|[") ? line : "", "user")+">"); }
			if (/\|\[ /.test(line)) {
				var side = i === start ? "top" : "bottom";
				var caption = line.substring(line.indexOf(" "), line.indexOf("]|"));
				if (!isBlank(caption)) {
					doc.add("<caption class='"+side+"'>"+processLine(caption)+"</caption>");
				}
			}
			if (/^\|[-=]/.test(line)) {
				if (!firstRow) { doc.add("</tr>"); }
				firstRow = false;
				var classes = line.indexOf('=') < 0 ? "" : "tborder";
				//TODO end table with border doesn't work as the tr is empty
				doc.add("<tr "+doc.styles(doc.line(i), classes)+">");
			} else if (/\|+!? /.test(line)) {
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

	function List(doc, start, end, level, pattern) {
		var i = start;		
		var bullet = pattern.test("* ");
		var no = pattern.exec(doc.line(i))[1];
		doc.add( bullet ? "<ul>\n" : "<ol type='"+listType(no)+"' start='"+listStart(no)+"'>\n");
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

	function listStart (item) { return item === '#' ? 1 : parseInt(item) ? parseInt(item) : item.charCodeAt() - listType(item).charCodeAt() + 1; } 
	function listType  (item) { var c = item.charAt(0); return /\d|#/.test(c) ? '1' : /i/i.test(c) ? c : /[A-Z]/.test(c) ? 'A' : 'a'; }

	function Minipage(doc, start, end, level, pattern) {
		var line = doc.line(start);
		var page = pattern.exec(line);
		var i = doc.scan(start+1, end, new RegExp("^"+page[1].replace(/\*/g, "\\*")+"($|[^\*])"));
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
