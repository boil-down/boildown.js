
String.prototype.replaceAll = function(search, replacement) {
	var target = this;
	return target.replace(new RegExp(search, 'g'), replacement);
};
String.prototype.indexOfNot = function(character) {
	var target = this;
	var i = 0;
	while (i < target.length && target.charAt(i) === character) {i++}
	return i;	
}

function processMarkup(markup) {
	var lines = markup.split(/\r?\n/g);
	return processLines(lines, 0, lines.length, 2); // this is h2 (heading level)
}

function processLines(lines, start, end, level) {
	var i = start;
	var i0 = i;
	var html = "";
	var tag = "";
	var blankLines = 0;
	while (i < end) {
		var line = lines[i];
		// horizontal lines
		if (line.startsWith("----")) {
			html+="<hr/>";
		// clearing
		} else if (line.startsWith("<<<")) {
			html+="<div style='clear: both;' />";
		// headings
		} else if (/^[ \t]*[=]{2,}.+[=]{2,}$/.test(line)) {
			var n = level;
			if (i == blankLines) { n = 1; }			
			html+="<h"+n+">";
			html+=processLine(line.replace(/^[  \t]*[=]+|[=]+$/g, ""))
			html+="</h"+n+">";
		// pre (advanced)
		} else if (line.startsWith("````")) {
			html+="<pre>"; //TODO highlighting of keywords
			i++;
			while (i < end && !lines[i].startsWith("````")) {
				var highlight = lines[i].startsWith("!");
				if (highlight) { html += "<div>"; }
				html+=escapeHTML(lines[i++].substring(2));
				html+="\n";
				if (highlight) { html += "</div>"; }
			}
			html+="</pre>";
		// pre (simple)
		} else if (isCodeBlock(line)) {
			html+="<pre"+processOptions(line.substring(3))+">";
			i++;
			while (i < end && !isCodeBlock(lines[i])) {
				html+=escapeHTML(lines[i++]);
				html+="\n";
			}
			html+="</pre>";
		// blockquote
		} else if (line.startsWith("> ")) {
			html+="<div class='quote'><blockquote>"
			i--;
			while (lines[i+1].startsWith("> ")) {
				html+=escapeHTML(lines[++i].substring(2))+"\n";
			}
			if (i+1 < end && /^[ \t]*[-]{2}.*$/.test(lines[i+1])) {
				i++;
				html+="<footer>&mdash;";
				html+=processLine(lines[i].substring(lines[i].indexOf("--")+2));
				html+="</footer>";
			}
			html+="</blockquote></div>"
		// listings
		} else if (isItem(line)) {
			html+="<ol>";
			var item = true;
			while (item) {
				lines[i] = lines[i].substring(line.indexOf(' ')); // remove item from line
				html+= "<li>";
				i0 = i;
				while (i+1 < end && isIndented2(lines[i+1])) { i++; lines[i] = lines[i].substring(2); }
				html+=processLines(lines, i0, i+1, level); 
				html+="</li>";
				item = i+1 < end && isItem(lines[i+1]);
				if (item) { i++ };
			}
			html+="</ol>";
		// columns
		} else if (isColumn(line)) {
			var depth = line.indexOfNot('~');
			html+="<div"+processOptions(line.substring(depth), "bd-col")+">";		
			i0 = ++i;
			var endOfColumn = new RegExp("^[~]{"+depth+"}($|[^~])");
			while (i < end && !endOfColumn.test(lines[i])) { i++; }
			html+=processLines(lines, i0, i, level+1); 
			html+="</div>";
		// just test		
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
	while (line.charAt(0) === '[') {
		var end = line.indexOf(']');
		if (isLetter(line.charAt(1))) {
			classes+=" "+line.substring(1, end);
		} else if (isDigit(line.charAt(1))) {
			styles+=" width:"+line.substring(1,end)+"%";
		} else if (line.startsWith("[<>")) {
			styles+= " text-align: center;"
		} else if (line.startsWith("[<]")) {
			styles+= " text-align: left;"
		} else if (line.startsWith("[>]")) {
			styles+= " text-align: right;"
		}
		line = line.substring(end+1);
	}
	return (classes ? " class='"+stripHTML(classes)+"'" : "") + (styles ? " style='"+styles+"'" : "");
}

function processLine(line) {
	return processInline(escapeHTML(line));
}

function processInline(line) {
	var start = 0;
	var end = line.indexOf("``", start);
	var html = "";
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
	var res = line
		.replaceAll("`([^`]+)`","<code>$1</code>")
		.replaceAll("\\*([^*]+)\\*","<b>$1</b>")
		.replaceAll("_([^_]+)_","<em>$1</em>")
		.replaceAll("\\+\\+\\+(.+?)\\+\\+\\+", "<ins>$1</ins>")
		.replaceAll("---(.+?)---", "<del>$1</del>")
		.replaceAll("\\^\\[(\\d+)\\]", "<sup><a href='#fnote$1'>$1</a></sup>")
		;
	do {
		var len0 = res.length;
		res = res.replaceAll("([']{2,})(.+)\\1", "<q>$2</q>");
	} while (len0 != res.length);
	return res;
}

function isCodeBlock(line) {
	return line.startsWith("```");
}

function isIndented2(line) {
	return /^([ \t]{2}.*|\\s*)$/.test(line);
}

function isColumn(line) {
	return line.startsWith("~~~");
}

function isItem(line) {
	return line.startsWith("* ") || line.startsWith("#. ") || /^([0-9]{1,2}|[a-zA-Z])\. .*$/.test(line);
}

function isDigit(c) {
	return c >= '0' && c <= '9';
}

function isLetter(c) {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z';
}

function isBlank(str) {
	return (!str || /^\s*$/.test(str));
}

function escapeHTML(html) {
	var text = document.createTextNode(html);
	var div = document.createElement('div');
	div.appendChild(text);
	return div.innerHTML;
}

function stripHTML(html) {
	var tmp = document.createElement("div");
	tmp.innerHTML = html;
	return tmp.textContent || tmp.innerText || "";
}
