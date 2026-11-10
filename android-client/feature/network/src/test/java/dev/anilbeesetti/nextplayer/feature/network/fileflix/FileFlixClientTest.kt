package dev.anilbeesetti.nextplayer.feature.network.fileflix

import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class FileFlixClientTest {

    private lateinit var server: MockWebServer
    private lateinit var client: FileFlixClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = FileFlixClient()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `normalizeUrl handles missing scheme and trailing slashes`() {
        assertEquals(
            "http://192.168.1.50:3000",
            FileFlixClient.normalizeUrl("192.168.1.50:3000/"),
        )
        assertEquals(
            "https://my-server.com:8080",
            FileFlixClient.normalizeUrl("https://my-server.com:8080///"),
        )
        assertEquals(
            "",
            FileFlixClient.normalizeUrl("  "),
        )
    }

    @Test
    fun `isValidUrl validates HTTP and HTTPS URLs`() {
        assertTrue(FileFlixClient.isValidUrl("http://192.168.1.100:3000"))
        assertTrue(FileFlixClient.isValidUrl("10.0.2.2:3000"))
        assertFalse(FileFlixClient.isValidUrl(""))
        assertFalse(FileFlixClient.isValidUrl("not a url"))
    }

    @Test
    fun `validateServer successfully decodes config response`() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"hasMedia":true,"rootName":"My Media Library"}"""),
        )

        val baseUrl = server.url("/").toString()
        val result = client.validateServer(baseUrl)

        assertTrue(
            "Expected success but got: ${result.exceptionOrNull()}",
            result.isSuccess,
        )
        val config = result.getOrNull()
        assertEquals(
            true,
            config?.hasMedia,
        )
        assertEquals(
            "My Media Library",
            config?.rootName,
        )

        val recorded = server.takeRequest()
        assertEquals(
            "/api/config",
            recorded.path,
        )
    }

    @Test
    fun `browse successfully parses directory entries`() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                        "dir": "Videos",
                        "breadcrumbs": [
                            {"name": "root", "rel": ""},
                            {"name": "Videos", "rel": "Videos"}
                        ],
                        "entries": [
                            {
                                "name": "FolderA",
                                "dir": true,
                                "rel": "Videos/FolderA"
                            },
                            {
                                "name": "clip.mp4",
                                "dir": false,
                                "rel": "Videos/clip.mp4",
                                "cat": "video",
                                "size": 1048576,
                                "mtimeMs": 1700000000000,
                                "sourceFormats": ["h264", "aac"]
                            }
                        ]
                    }
                    """.trimIndent(),
                ),
        )

        val baseUrl = server.url("/").toString()
        val result = client.browse(
            baseUrl,
            "Videos",
        )

        assertTrue(result.isSuccess)
        val browse = result.getOrNull()!!
        assertEquals(
            "Videos",
            browse.dir,
        )
        assertEquals(
            2,
            browse.entries.size,
        )
        assertTrue(browse.entries[0].isDirectory)
        assertTrue(browse.entries[1].isVideo)
        assertEquals(
            1048576L,
            browse.entries[1].size,
        )
    }

    @Test
    fun `search parses search results`() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                        "dir": "",
                        "results": [
                            {
                                "name": "demo.mp4",
                                "dir": false,
                                "rel": "Movies/demo.mp4",
                                "cat": "video",
                                "size": 2048
                            }
                        ]
                    }
                    """.trimIndent(),
                ),
        )

        val baseUrl = server.url("/").toString()
        val result = client.search(
            baseUrl,
            "demo",
        )

        assertTrue(result.isSuccess)
        val search = result.getOrNull()!!
        assertEquals(
            1,
            search.results.size,
        )
        assertEquals(
            "demo.mp4",
            search.results[0].name,
        )
    }

    @Test
    fun `url builders generate expected query endpoints`() {
        val base = "http://192.168.1.10:3000"
        assertEquals(
            "http://192.168.1.10:3000/api/stream?path=Videos%2Fdemo.mp4",
            client.buildStreamUrl(
                base,
                "Videos/demo.mp4",
            ),
        )
        assertEquals(
            "http://192.168.1.10:3000/api/thumb?path=Videos%2Fdemo.mp4&mt=12345",
            client.buildThumbUrl(
                base,
                "Videos/demo.mp4",
                12345L,
            ),
        )
        assertEquals(
            "http://192.168.1.10:3000/api/subtitle?srt=Videos%2Fdemo.srt",
            client.buildSubtitleUrl(
                base,
                "Videos/demo.mp4",
                srtRel = "Videos/demo.srt",
            ),
        )
        assertEquals(
            "http://192.168.1.10:3000/api/subtitle?path=Videos%2Fdemo.mp4&idx=1",
            client.buildSubtitleUrl(
                base,
                "Videos/demo.mp4",
                index = 1,
            ),
        )
    }
}
