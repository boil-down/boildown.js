
var Boildown = (function() {
	'use strict';

	// inline
	const LINK_REF = /\[\[((?:https?:\/\/)?(?:[-_a-zA-Z0-9]{0,15}[.:/#+]?){1,20}) (.+?)\]\]/g;
	const LINK_REL = /\[\[(\d+(?:\.\d+)*)\]\]/g;

	// blocks	
	const INDENT    = /^([ \t]{2}|\\s*$)/;
	const ITEM      = /^(#|[0-9]{1,2}|[a-zA-Z])\. /;
	const HEADING   = /^[=]{2,}(.+)[=]{2,}(?:\[.*\])?[ \t]*$/;
	const TABLE     = /^\|+(!?.+?|-+)\|(?:\[.*\])?$/;

	function Doc(markup) {
		this.markup = markup;		
		this.lines  = markup.split(/\r?\n/g);
		this.html   = "";
		this.blankLines = 0;
	}

	var _ = Doc.prototype; 
	_.len        = function ()  { return this.lines.length; }
	// line content
	_.tip        = function (n) { return this.lines[n].charAt(0); }
	_.line       = function (n) { return this.lines[n]; }
	_.heading    = function (n) { return this.cutout(n, HEADING); }
	_.itemStart  = function (n) { var c = this.tip(n); return c.charCodeAt() - this.itemType(n).charCodeAt() + 1; } 
	_.itemType   = function (n) { var c = this.tip(n); return /\d/.test(c) ? '1' : /i/i.test(c) ? c : /[A-Z]/.test(c) ? 'A' : 'a'; }
	// line based properties
	_.isAddition = function (n) { return this.line(n) === "+++"; }
	_.isDeletion = function (n) { return this.line(n) === "---"; }
	_.isPre      = function (n) { return this.starts(n, "```"); }
	_.isHLine    = function (n) { return this.starts(n, "----"); }
	_.isBreak    = function (n) { return this.starts(n, "<<<"); }
	_.isQuote    = function (n) { return this.starts(n, "> "); }
	_.isDescribe = function (n) { return this.starts(n, "= "); }
	_.isExample  = function (n) { return this.starts(n, "? "); }
	_.isMinipage = function (n) { return this.starts(n, ":::"); }
	_.isBullet   = function (n) { return this.starts(n, "* "); }
	_.isItem     = function (n) { return this.matches(n, ITEM); }
	_.isTable    = function (n) { return this.matches(n, TABLE); }
	_.isHeading  = function (n) { return this.matches(n, HEADING); }
	_.isIndented = function (n) { return this.matches(n, INDENT); }
	// line based modifications	
	_.deIndent   = function (n) { this.chop(n, 2); }
	_.deItem     = function (n) { this.chop(n, this.lines[n].indexOf(' ')); }
	_.deBlock    = function (n, e, f) { while (n < e && f(n)) { this.deIndent(n++); } }
	// line based helpers
	_.chop       = function (n, c)     { this.lines[n] = this.lines[n].substring(c); }
	_.starts     = function (n, str)   { return this.lines[n].startsWith(str); }
	_.matches    = function (n, regex) { return regex.test(this.lines[n]); }
	_.cutout     = function (n, regex) { return regex.exec(this.lines[n])[1]; }
	// output
	_.add        = function (elem) { this.html+=elem; }

	_.block      = function (n) { 
		if (this.isHLine(n)) { return blockHLine; }
		if (this.isBreak(n)) { return blockBreak; }
		if (this.isHeading(n)) { return blockHeading; }
		if (this.isPre(n)) { return blockVerbatim; }
		if (this.isQuote(n)) { return blockQuote; }
		if (this.isDescribe(n)) { return blockDescribe; }
		if (this.isExample(n)) { return blockExample; }
		if (this.isItem(n)) { return blockListing; }
		if (this.isBullet(n)) { return blockListing; }
		if (this.isMinipage(n)) { return blockMinipage; }
		if (this.isTable(n)) { return blockTable; }
		return blockParagraph;
	 }

	return {
		toHTML: processMarkup
	};

	function processMarkup(markup) {
		var doc = new Doc(markup);
		processLines(doc, 0, doc.len(), 2); // this is h2 (heading level)
		return doc.html;
	}

	function processLines(doc, start, end, level) {
		var i = start;
		while (i < end) {
			var j = i;
			i = doc.block(i)(doc, i, end, level);
			if (i == j) { console.log("endless loop at line: "+i); return; }
			j = i;
		}
	}

	// BLOCK functions return the line index after the block

	function blockBreak(doc, start, end, level) {
		doc.add("<div style='clear: both;'></div>\n");
		return start+1;
	}

	function blockHLine(doc, start, end, level) {
		// TODO options
		doc.add("<hr/>\n");
		return start+1;
	}

	function blockParagraph(doc, start, end, level) {
		var line = doc.line(start);
		if (isBlank(line)) {
			doc.blankLines++;
			// TODO possible end of par
		} else {
			doc.add(processLine(line)+"\n");
		}
		return start+1;
	}

	function blockHeading(doc, start, end, level) {
		var n = level;
		if (start == doc.blankLines) { n = 1; }			
		doc.add("<h"+n+processOptions(doc.line(start))+">"+processLine(doc.heading(start))+"</h"+n+">\t");
		return start+1;
	}

	function blockQuote(doc, start, end, level) {
		//TODO options, an option for white-space wrapping
		var i = start;
		while (i < end && doc.isQuote(i)) { doc.deIndent(i++); }
		var options = "";
		if (doc.starts(start, "[")) {
			options = processOptions(doc.line(start));
			start++;
		}
		doc.add("<blockquote "+options+">\n"); 
		processLines(doc, start, i, level+1);
		doc.add("</blockquote>\n");
		return i;
	}

	function blockDescribe(doc, start, end, level) {
		var i = start;
		while (i < end && doc.isDescribe(i)) { doc.deIndent(i++); }
		doc.add("<table class='describe'><tr><td><pre class='source'>");
		var l0 = doc.html.length;
		// following line must be done before processing the lines!
		var example = escapeHTML(doc.lines.slice(start, i).join("\n"));
		processLines(doc, start, i, level);
		var content = escapeHTML(doc.html.substring(l0));
		doc.html=doc.html.substring(0, l0);
		doc.add(example);
		doc.add("</pre></td><td>\n<pre class='source'>\n"); 
		doc.add(content);
		doc.add("</pre>\n</td></tr></table>");
		return i;
	}

	function blockExample(doc, start, end, level) {
		var i = start;
		while (i < end && doc.isExample(i)) { doc.deIndent(i++); }
		doc.add("<table class='example'><tr><td><pre class='source'>");
		var l0 = doc.html.length;
		// following line must be done before processing the lines!
		var example = escapeHTML(doc.lines.slice(start, i).join("\n"));
		processLines(doc, start, i, level);
		var content = doc.html.substring(l0);
		doc.html=doc.html.substring(0, l0);
		doc.add(example);
		doc.add("</pre></td><td>\n"); 
		doc.add(content);
		doc.add("</td></tr></table>");
		return i;
	}

	function blockVerbatim(doc, start, end, level) {
		//TODO highlighting of keywords
		var i = start;
		var ci = 16;
		doc.add("<pre"+processOptions(doc.line(i++))+">\n");
		while (i < end && !doc.isPre(i)) { 
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
			doc.add("\t<span "+css+">"+escapeHTML(line.substring(ci))+"</span>\n");
		}
		doc.add("</pre>\n");
		return i+1;
	}

	function blockTable(doc, start, end, level) {
		var i = start;
		doc.add("<table class='user'>");
		var firstRow = true;
		while (i < end && doc.isTable(i)) { 
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

	function blockListing(doc, start, end, level) {
		var i = start;		
		var bullet = doc.isBullet(i);
		doc.add( bullet ? "<ul>\n" : "<ol type='"+doc.itemType(i)+"' start='"+doc.itemStart(i)+"'>\n");
		var item = true;
		while (i < end && (bullet && doc.isBullet(i) || doc.isItem(i))) {
			var i0 = i;
			doc.deItem(i);
			i++;
			while (i < end && doc.isIndented(i)) { doc.deIndent(i++); }
			doc.add("<li>\n\t");
			processLines(doc, i0, i, level);
			doc.add("</li>\n");
		}
		doc.add( bullet ? "</ul>\n" : "</ol>\n");
		return i;
	}

	function blockMinipage(doc, start, end, level) {
		var line = doc.line(start);
		var depth = line.search(/[^:]/);
		var eop = new RegExp("^[:]{"+depth+"}($|[^:])");
		var i = start+1;
		while (i < end && !eop.test(doc.line(i))) { i++; }
		doc.add("<div"+processOptions(line, "bd-mp")+">\n\t");		
		processLines(doc, start+1, i, level+1); 
		doc.add("</div>\n");
		return i+1;
	}

	function processOptions(line, classes) {
		classes = classes ? classes : "";
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
			[ /^<-$/,  "float", "left"],
			[ /^->$/,  "float", "right"],
			[ /^\\\\$/, "white-space", "pre-wrap"],
		];
		for (var i = 0; i < OPTIONS.length; i++) {
			if (OPTIONS[i][0].test(val))
				return OPTIONS[i]; 			
		}
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
		return inlineQuotes(line
			.replace(LINK_REF, "<a href=\"$1\">$2</a>")
			.replace(LINK_REL, "<a href=\"#sec-$1\">$1</a>")
			.replace(/`([^`]+)`/g,"<code>$1</code>")
			.replace(/\*([^*]+)\*/g,"<b>$1</b>")
			.replace(/_([^_\/]+)_/g,"<em>$1</em>")
			.replace(/~([^~]+)~/g,"<s>$1</s>")
			.replace(/\+\+\+([^+].*?)\+\+\+/g, "<ins>$1</ins>")
			.replace(/---([^-].*?)---/g, "<del>$1</del>")
			.replace(/\^\[(\d+)\]/g, "<sup><a href='#fnote$1'>$1</a></sup>")
			.replace(/&amp;([a-zA-Z]{2,10});/g, "&$1;") // unescape HTML entities
			.replace(/ \\\\(?: |$)/, "<br/>")
			.replace(/(?:^| )--(?:$| )/g, " &mdash; ")
			);
	}

	function inlineQuotes(line) {
		var res = line;		
		do {
			var len0 = res.length;
			res = res.replace(/([']{2,})(.+?)\1($|[^'])/g, "<q>$2</q>$3");
		} while (len0 !== res.length);
		return res;
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
