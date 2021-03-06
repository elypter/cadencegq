for (let i of ["blockedVideos", "blockedTitles", "blockedAuthors", "blockedAuthorIDs"]) lsm.setup(i, "");

const filters = [
    {
        related: video => video.videoId,
        feed: video => video.videoId,
        disallow: id => lsm.array("blockedVideos").array.includes(id)
    },{
        related: video => video.title,
        feed: video => video.title,
        disallow: title => lsm.array("blockedTitles").array.some(setting => title.toLowerCase().includes(setting.toLowerCase()))
    },{
        related: video => video.author,
        feed: video => video.author,
        disallow: name => lsm.array("blockedAuthors").array.some(setting => setting.toLowerCase() == name.toLowerCase())
    },{
        feed: video => video.authorId,
        disallow: id => lsm.array("blockedAuthorIDs").array.includes(id)
    }
]

function filterVideos(feed, source) {
    if (!source) throw new Error("No source provided to filterVideos");
    //let result = feed.filter(video => !filters.some(f => f[source] ? f.disallow(f[source](video)) : false));
    lsm.setup("videoFilter", "[]");
    let filters = JSON.parse(lsm.get("videoFilter"));
    let result = feed.filter(feedItem => {
        let someFiltersApply = filters.some(filterConditions => {
            let conditionsApply = filterConditions.every(condition => {
                let input = feedItem[condition.key];
                let value = condition.value;
                if (!condition.comparison.match_case) {
                    input = input.toLowerCase();
                    value = value.toLowerCase();
                }
                let result;
                if (condition.comparison.type == "equal") {
                    result = input == value;
                } else if (condition.comparison.type == "contain") {
                    result = input.includes(value);
                }
                if (condition.comparison.invert) result = !result;
                return result;
            });
            return conditionsApply;
        });
        return !someFiltersApply; // true if video matched a blocking filter, so use false to remove it from the feed
    });
    return [result, feed.length - result.length];
}

function thumbnailURL(id, quality) {
    if (!quality) quality = "mqdefault";
    let proxyEnabled = lsm.get("disableProxyThumbnails") != "1";
    if (proxyEnabled) return `https://invidio.us/vi/${id}/${quality}.jpg`;
    else return `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
}

function generateVideoListItem(video, index) {
    if (video.published && video.published < Date.now()/1000) video.published = video.published * 1000;
    let authorText = "";
    const addToAuthorText = text => authorText += " • " + text;
    if (video.viewCount) {
        addToAuthorText(viewCountText(video.viewCount));
    }
    if (video.publishedText != "0 seconds ago") {
        if (video.publishedText && lsm.get("settingApproximateDates") != "1") {
            let match = video.publishedText.match(/^(\d+) (\w+) ago$/);
            if (match) {
                let count = match[1];
                let unit = match[2];
                if (count == "1" && unit.endsWith("s")) video.publishedText = count+" "+unit.slice(0, -1)+" ago";
            }
            addToAuthorText(video.publishedText);
        } else if (video.published) {
            addToAuthorText(humaniseDate(video.published));
        }
    }
    let ne = new ElemJS("div")
    .attribute("data-lengthseconds", video.lengthSeconds)
    .class("searchItem", index != undefined && "playlistItem")
    .child(index != undefined &&
        new ElemJS("div")
        .class("playlistIndex")
        .text(index+1)
    )
    .child(
        new ElemJS("a")
        .attribute("href", "/cloudtube/video/"+video.videoId)
        .class("itemThumbnailContainer")
        .attribute("data-prettyseconds", prettySeconds(video.lengthSeconds))
        .child(
            new ElemJS("img")
            .attribute("alt", "")
            .attribute("src", thumbnailURL(video.videoId))
        )
    )
    .child(
        new ElemJS("div")
        .class("videoListDetails")
        .child(
            new ElemJS("a")
            .class("videoListTitle")
            .attribute("href", "/cloudtube/video/"+video.videoId)
            .text(video.title)
        )
        .child(
            new ElemJS("span")
            .child(
                new ElemJS("a")
                .class("videoListAuthor")
                .text(video.author)
                .attribute("href", "/cloudtube/channel/"+video.authorId)
            )
            .child(
                new ElemJS("span")
                .text(authorText)
            )
        )
        .child(video.descriptionHtml &&
            new ElemJS("span")
            .class("videoListDescription")
            .html(video.descriptionHtml)
        )
    )
    return ne;
}

function generateVideoList(data, blockedWarning, listContainer, isPlaylist) {
    let videoList = data.latestVideos || data.videos;
    let filterReturn = filterVideos(videoList, "feed");
    videoList = filterReturn[0];
    if (filterReturn[1]) {
        blockedWarning.style.display = "";
        blockedWarning.children[0].innerText = filterReturn[1];
    }
    for (let i = 0; i < videoList.length; i++) {
        let video = videoList[i];
        listContainer.appendChild(generateVideoListItem(video, isPlaylist ? i : undefined).element);
    }
}

function uploadSubscriptions(subscriptions) {
    return new Promise(resolve => {
        if (lsm.get("token")) {
            request("/api/youtube/subscriptions/import", resolve, {token: lsm.get("token"), subscriptions});
        } else resolve();
    });
}