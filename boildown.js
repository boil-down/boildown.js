
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
	_.isMinipage = function (n) { return this.starts(n, ":::"); }
	_.isBullet   = function (n) { return this.starts(n, "* "); }
	_.isItem     = function (n) { return this.matches(n, ITEM); }
	_.isTable    = function (n) { return this.matches(n, TABLE); }
	_.isHeading  = function (n) { return this.matches(n, HEADING); }
	_.isIndented = function (n) { return this.matches(n, INDENT); }
	// line based modifications	
	_.deIndent   = function (n) { this.chop(n, 2); }
	_.deItem     = function (n) { this.chop(n, this.lines[n].indexOf(' ')); }
	// line based helpers
	_.chop       = function (n, c)     { this.lines[n] = this.lines[n].substring(c); }
	_.starts     = function (n, str)   { return this.lines[n].startsWith(str); }
	_.matches    = function (n, regex) { return regex.test(this.lines[n]); }
	_.cutout     = function (n, regex) { return regex.exec(this.lines[n])[1]; }

	return {
		toHTML: processMarkup
	};

	function processMarkup(markup) {
		var doc = new Doc(markup);
		return processLines(doc, 0, doc.len(), 2); // this is h2 (heading level)
	}

	function processLines(doc, start, end, level) {
		var i = start;
		var i0 = i;
		var html = "";
		var tag = "";
		var blankLines = 0;
		while (i < end) {
			var line = doc.line(i);
			if (doc.isHLine(i)) {
				html+="<hr/>";
			} else if (doc.isBreak(i)) {
				html+="<div style='clear: both;'></div>";
			} else if (doc.isHeading(i)) {
				var n = level;
				if (i == blankLines) { n = 1; }			
				html+="<h"+n+processOptions(line)+">"+processLine(doc.heading(i))+"</h"+n+">";
			} else if (line.startsWith("````")) { //TODO just one pre, ! behaviour is always used as it is easy to skip by indenting
				html+="<pre>"; //TODO highlighting of keywords
				i++;
				while (i < end && !doc.line(i).startsWith("````")) {
					var highlight = doc.line(i).startsWith("!");
					if (highlight) { html += "<div>"; }
					html+=escapeHTML(doc.line(i++).substring(2));
					html+="\n";
					if (highlight) { html += "</div>"; }
				}
				html+="</pre>";
			} else if (doc.isPre(i)) {
				html+="<pre"+processOptions(line)+">";
				i++;
				while (i < end && !doc.isPre(i)) {
					html+="<span>"+escapeHTML(doc.line(i++))+"</span>\n";
				}
				html+="</pre>";
			} else if (doc.isQuote(i)) {
				html+="<div class='quote'><blockquote>"
				i--;
				while (doc.isQuote(i+1)) {
					html+=processLine(doc.line(++i).substring(2))+"\n";
				}
				if (i+1 < end && /^[ \t]*[-]{2}.*$/.test(doc.line(i+1))) {
					i++;
					html+="<footer>&mdash;";
					html+=processLine(doc.line(i).substring(doc.line(i).indexOf("--")+2));
					html+="</footer>";
				}
				html+="</blockquote></div>"
			} else if (doc.isItem(i) || doc.isBullet(i)) {
				var bullet = doc.isBullet(i);
				html+= bullet ? "<ul>" : "<ol type='"+doc.itemType(i)+"' start='"+doc.itemStart(i)+"'>";
				var item = true;
				while (item) {
					doc.deItem(i);
					i0 = i;
					while (i+1 < end && doc.isIndented(i+1)) { doc.deIndent(++i); }
					html+= "<li>"+processLines(doc, i0, i+1, level)+"</li>";
					item = i+1 < end && doc.isItem(i+1);
					if (item) { i++ };
				}
				html+= bullet ? "</ul>" : "</ol>";
			} else if (doc.isMinipage(i)) {
				var depth = line.search("[^:]");
				html+="<div"+processOptions(line, "bd-col")+">";		
				i0 = ++i;
				var endOfColumn = new RegExp("^[:]{"+depth+"}($|[^:])");
				while (i < end && !endOfColumn.test(doc.line(i))) { i++; }
				html+=processLines(doc, i0, i, level+1); 
				html+="</div>";
			// just text		
			} else {
				if (isBlank(line)) {
					blankLines++;
					// TODO possible end of par
				} else {
					html+=processLine(line);
					html+=" ";
				}
			}
			i++;
		}
		return html;
	}

	function processOptions(line, classes) {
		classes = classes ? classes : "";
		var styles = "";
		var start = line.indexOf('[');
		while (start >= 0) {
			var end = line.indexOf(']', start);
			var val = line.substring(start+1, end);
			if (/^(?: ?[a-zA-Z][-_a-zA-Z0-9]*)+$/.test(val)) {
				classes+=" "+val;
			} else if (/^[0-9]{1,3}$/.test(val)) {
				styles+=" width:"+val+"%;"; // use width attribute?
			} else if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
				styles+=" background-color: "+val+";";
			} else if (val === "<>") {
				styles+= " text-align: center;"
			} else if (val === "<") {
				styles+= " text-align: left;"
			} else if (val === ">") {
				styles+= " text-align: right;"
			} else if (val === "++") {
				styles+= " font-size: x-large;"; //TODO and so on...(medium, large, small, x-small)
			}
			// option for floating?
			// TODO option for preformatted text (linebreaks as in source)
			// padding? maybe "~px"
			start = line.indexOf('[', end);
		}
		return (classes ? " class='"+classes+"'" : "") + (styles ? " style='"+styles+"'" : "");
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
				html+=processInlineSubst(line.substring(start, end));
			}
			start=end+2;
			end=line.indexOf("``", start);
			html+="<code>"+line.substring(start, end)+"</code>";
			start=end+2;
			end=line.indexOf("``", start);
		}
		html+=processInlineSubst(line.substring(start, line.length));
		return html;
	}

	function processInlineSubst(line) {
		return processQuotes(line
			.replace(LINK_REF, "<a href=\"$1\">$2</a>")
			.replace(LINK_REL, "<a href=\"#sec-$1\">$1</a>")
			.replace(/`([^`]+)`/g,"<code>$1</code>")
			.replace(/\*([^*]+)\*/g,"<b>$1</b>")
			.replace(/_([^_\/]+)_/g,"<em>$1</em>")
			.replace(/\+\+\+(.+?)\+\+\+/g, "<ins>$1</ins>")
			.replace(/---(.+?)---/g, "<del>$1</del>")
			.replace(/\^\[(\d+)\]/g, "<sup><a href='#fnote$1'>$1</a></sup>")
			.replace(/&amp;([a-zA-Z]{2,10});/g, "&$1;") // unescape HTML entities
			); // available: ~
	}

	function processQuotes(line) {
		var res = line;		
		do {
			var len0 = res.length;
			res = res.replace(/([']{2,})(.+)\1/g, "<q>$2</q>");
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
